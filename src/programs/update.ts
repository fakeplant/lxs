import { Command } from "commander"
import { ipLog, readFileSafe } from "../utils"
import JSON5 from "json5"
import fs from "node:fs"
import path from "path"
import WebSocketClient from "../websocket"
import {
  formatCanopyMessage,
  getDeviceChip,
  getOtaPath,
  parseCanopyMessage,
  parseCanopyRid,
} from "../canopy"

export const createUpdateCommand = () => {
  return new Command("update")
    .description("Update controller firmware.")
    .requiredOption("-i, --ips <path>", "path to the ips json file")
    .requiredOption("-v, --version <0.0.0>", "download a single version")
    .action(async (options) => {
      const ipsPath = options.ips
      const version = options.version

      await validateControllersFirmware(ipsPath, version)

      process.exit(1)
    })
}

export const validateControllersFirmware = async (
  ipsPath: string,
  version: string
) => {
  // Get IPs data
  const ipsData = readFileSafe(ipsPath)
  if (!ipsData) {
    console.error("Could not read ips file.")
    process.exit(1)
  }
  const ips = JSON5.parse(ipsData)

  // Validate each IP
  for (const ip of ips) {
    await validateControllerFirmware(ip, version)
  }
}

export const validateControllerFirmware = async (
  ip: string,
  version: string
) => {
  // V2: validate config file w/ schemas

  // Check if valid IP address, x.x.x.x
  if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
    ipLog(ip, "Invalid IP address", { error: true })
    return
  }

  // Create a new WebSocketClient instance
  const wsClient = new WebSocketClient(`ws://${ip}:81`)

  // Connect to the WebSocket server
  try {
    ipLog(ip, "Connecting")
    await wsClient.connect()
  } catch (error) {
    ipLog(ip, "Unable to connect", {
      error: true,
      clear: true,
    })
    return
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  ipLog(ip, "Checking version", { clear: true })

  // Check current firmware version
  const message = formatCanopyMessage("get", "info", {})
  const stringifiedMessage = JSON.stringify(message)

  // Validate rid of response (in case other commands are sent)
  // and parse the info message
  const infoResp = await wsClient.sendCommand(stringifiedMessage)
  const parsedRid = parseCanopyRid(JSON.parse(infoResp))
  if (!parsedRid || parsedRid !== message._rid) {
    ipLog(ip, `RID error`, { clear: true, error: true })
    return
  }
  const parsedInfoResp = parseCanopyMessage(JSON.parse(infoResp))
  if (!parsedInfoResp.success) {
    ipLog(ip, `Response error`, { clear: true, error: true })
    return
  }

  // Save network settings to temp for restore later
  const networkResp = await wsClient.sendCommand(
    JSON.stringify(formatCanopyMessage("get", "network", {}))
  )
  const parsedNetworkResp = parseCanopyMessage(JSON.parse(networkResp))
  if (!parsedNetworkResp.success) {
    ipLog(ip, `Network response error`, { clear: true, error: true })
    return
  }
  fs.mkdirSync(`temp/controllers/${parsedInfoResp.data.uid}`, {
    recursive: true,
  })
  fs.writeFileSync(
    `temp/controllers/${parsedInfoResp.data.uid}/network.json`,
    JSON.stringify({ network: parsedNetworkResp.data }, null, 2)
  )

  // Version cleanup
  // if version does not start w/ a "v" then add it
  version = version.startsWith("v") ? version : `v${version}`

  // Skip if already up to date
  if (parsedInfoResp?.data?.version === version) {
    ipLog(ip, `Up to date - ${parsedInfoResp?.data?.version}`, { clear: true })
    return
  }
  ipLog(ip, `Current version - ${parsedInfoResp?.data?.version}`, {
    clear: true,
  })

  // Check if valid version
  const versionsPath = "temp/firmware/versions.json"
  const versionsFile = fs.readFileSync(versionsPath, "utf8")
  const versions = JSON.parse(versionsFile)
  const firmwareDirPath = "temp/firmware/builds"
  let buildPath
  try {
    buildPath = versions[version]
  } catch (error) {
    ipLog(ip, "Version does not exist", { error: true })
    return
  }

  // Attempt to get manifest folder and see if downloaded
  const manifestPath = path.join(firmwareDirPath, buildPath)
  let otaManifest
  try {
    otaManifest = JSON.parse(
      fs.readFileSync(path.join(manifestPath, "ota.json"), "utf8")
    )
  } catch (error) {
    ipLog(ip, "Version not downloaded", { error: true })
    return
  }
  const chip = getDeviceChip(parsedInfoResp.data)
  const otaPath = getOtaPath(otaManifest, chip)
  // Get firmware file
  let firmwareFile
  try {
    firmwareFile = fs.readFileSync(path.join(manifestPath, otaPath))
  } catch (error) {
    ipLog(ip, "Firmware version not found", { error: true })
    return
  }

  // Start OTA command
  const startReq = formatCanopyMessage("ota", "", { size: firmwareFile.length })
  const startResp = await wsClient.sendCommand(JSON.stringify(startReq))
  const startRespJson = JSON.parse(startResp)
  if (startRespJson.result) {
    ipLog(ip, "0%")
  } else {
    console.log(startRespJson)
    ipLog(ip, `Firmware update failed to start - ${startRespJson.error}`, {
      error: true,
    })

    // Restart the device to reset update
    const resetReq = formatCanopyMessage("reset", "", {})
    await wsClient.sendCommand(JSON.stringify(resetReq))
    ipLog(ip, "Resetting device to try again later")
    return
  }

  // Send OTA chunks
  const chunkSize = 8192
  let progress = 0
  for (let i = 0; i < firmwareFile.length; i += chunkSize) {
    const chunk = firmwareFile.slice(i, i + chunkSize)
    const sent = await wsClient.sendBinary(Array.from(chunk))
    const sentJson = JSON.parse(sent)
    progress =
      sentJson.remaining === 0
        ? 1
        : sentJson.ota.progress /
          (sentJson.ota.remaining + sentJson.ota.progress)
    ipLog(ip, `${Math.round(progress * 100)}%`, { clear: true })
    if (sentJson.ota.remaining === 0) {
      break
    }
  }

  // Restart the device to reset update
  const resetReq = formatCanopyMessage("reset", "", {})
  await wsClient.sendCommand(JSON.stringify(resetReq), true)
  ipLog(ip, "Device updated", { clear: true })
}