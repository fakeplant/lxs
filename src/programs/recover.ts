import { Command } from "commander"
import { ipLog, readFileSafe } from "../utils"
import WebSocketClient from "../websocket"
import {
  formatCanopyMessage,
  parseCanopyMessage,
  parseCanopyRid,
} from "../canopy"
import mdns, { Service } from "mdns"

export const createRecoverCommand = () => {
  return new Command("recover")
    .description(
      "Recover controller network settings after breaking firmware updates."
    )
    .action(async (options) => {
      await recoverControllersNetwork()

      process.exit(1)
    })
}

export const recoverControllersNetwork = async () => {
  const browser = mdns.createBrowser(
    mdns.makeServiceType({ name: "_chromatech-config", protocol: "tcp" })
  )

  const services: Service[] = []

  browser.on("serviceUp", (service) => {
    services.push(service)
  })

  browser.on("serviceDown", (service) => {
    // console.log("Service down:", service)
  })

  // Start the browser
  console.log("Scanning...")
  browser.start()
  await new Promise((resolve) => setTimeout(resolve, 2000))

  for (const service of services) {
    await parseService(service)
  }
}

export const parseService = async (service: Service) => {
  // console.log("service", service)

  // Get first IP
  const ip = service.addresses[0]

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
  ipLog(ip, "Connected", {
    clear: true,
  })

  // Get info of controller
  const message = formatCanopyMessage("get", "info", {})
  const stringifiedMessage = JSON.stringify(message)
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

  // Get network file
  const uid = parsedInfoResp.data.uid
  const networkDir = `temp/controllers/${uid}`
  const networkPath = `${networkDir}/network.json`
  const networkData = readFileSafe(networkPath)
  if (!networkData) {
    ipLog(ip, `Skipped`, { clear: true })
    return
  }

  // Update
  ipLog(ip, "Recovering network", { clear: true })

  // Update network config
  const networkMessage = formatCanopyMessage(
    "set",
    "network",
    JSON.parse(networkData).network
  )
  await wsClient.sendCommand(JSON.stringify(networkMessage))

  // Success
  ipLog(ip, "Recovered", { success: true, clear: true })

  // Delete the networkDir
  // fs.rmdirSync(networkDir, { recursive: true })
}