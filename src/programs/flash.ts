import { Command } from "commander"
import { ipLog, readFileSafe } from "../utils"
import { loadProjectConfig, getTempDirectory } from "../project"
import { SerialClient } from "../serial"
import JSON5 from "json5"
import fs from "node:fs"
import path from "path"
import chalk from "chalk"
import {
  formatCanopyMessage,
  getDeviceChip,
  getOtaPath,
  parseCanopyMessage,
  parseCanopyRid,
} from "../canopy"

export const createFlashCommand = () => {
  const command = new Command("flash")
  command
    .argument("<project>", "project name")
    .argument("<ip>", "IP address to configure")
    .option("-v, --version <0.0.0>", "firmware version to flash")
    .description("Flash controller with firmware, network, and config over serial.")
    .addHelpText('after', `
Examples:
  lxs flash mothership 10.7.100.50             # use project firmware version
  lxs flash mothership 10.7.100.50 --version 0.12.10 # override version

This command flashes controllers via serial connection (USB) in three steps:
1. Firmware update - Flashes firmware using OTA protocol over serial
2. Network configuration - Sets IP, hostname, and network settings  
3. Controller configuration - Applies all config sections (LEDs, power, etc.)

Supported devices: ESP32-S3, ESP32-C3, CH340 (detected automatically)
Waits for device connection, flashes, then waits for disconnection.`)
    .action(async (project, ip, options) => {
      // Validate IP format
      if (!ip.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
        console.error("Invalid IP address format")
        process.exit(1)
      }

      // Load project configuration
      const projectConfig = loadProjectConfig(project)
      if (!projectConfig) {
        process.exit(1)
      }

      // Get firmware version
      let version = options.version
      if (!version && projectConfig.firmwarePath) {
        const firmwareData = readFileSafe(projectConfig.firmwarePath)
        if (firmwareData) {
          try {
            const firmwareConfig = JSON5.parse(firmwareData)
            version = firmwareConfig.version
            console.log(`Using firmware version ${version} from project config`)
          } catch (error) {
            console.warn(`Warning: Could not parse firmware.json for project ${project}`)
          }
        }
      }

      if (!version) {
        console.error("No firmware version specified. Use --version or configure in project firmware.json")
        process.exit(1)
      }

      // Get config files
      if (!projectConfig.configPath || !fs.existsSync(projectConfig.configPath)) {
        console.error(`Project '${project}' does not have a config file`)
        process.exit(1)
      }

      if (!projectConfig.networkPath || !fs.existsSync(projectConfig.networkPath)) {
        console.error(`Project '${project}' does not have a network config file`)
        process.exit(1)
      }

      console.log(chalk.blue("Starting flash process..."))
      console.log(chalk.yellow(`Project: ${project}`))
      console.log(chalk.yellow(`IP: ${ip}`))
      console.log(chalk.yellow(`Firmware: ${version}`))

      await flashController(ip, version, projectConfig.configPath, projectConfig.networkPath)

      console.log(chalk.green("Flash process completed!"))
    })
  
  return command
}

const flashController = async (
  ip: string,
  version: string,
  configPath: string,
  networkPath: string
) => {
  const serialClient = new SerialClient()

  try {
    // Wait for device connection
    const device = await SerialClient.waitForSingleDevice()
    await serialClient.connect(device)

    console.log(chalk.blue("Device connected, starting flash sequence..."))

    // Step 1: Firmware Update
    console.log(chalk.cyan("Step 1: Updating firmware..."))
    await flashFirmware(serialClient, ip, version)

    // Step 2: Network Configuration  
    console.log(chalk.cyan("Step 2: Configuring network..."))
    await flashNetwork(serialClient, ip, networkPath)

    // Step 3: Controller Configuration
    console.log(chalk.cyan("Step 3: Configuring controller..."))
    await flashConfig(serialClient, ip, configPath)

    console.log(chalk.green("Flash completed successfully!"))
    console.log(chalk.yellow("Please disconnect the device."))

    // Wait for disconnection
    await serialClient.waitForDisconnection()

  } catch (error) {
    console.error(chalk.red("Flash failed:"), error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await serialClient.disconnect()
  }
}

const flashFirmware = async (serialClient: SerialClient, ip: string, version: string) => {
  // Version cleanup
  version = version.startsWith("v") ? version : `v${version}`

  // Check firmware files
  const versionsPath = path.join(getTempDirectory(), "firmware", "versions.json")
  if (!fs.existsSync(versionsPath)) {
    throw new Error("Firmware versions not found. Run 'lxs firmware --version <version>' first.")
  }

  const versionsFile = fs.readFileSync(versionsPath, "utf8")
  const versions = JSON.parse(versionsFile)
  const firmwareDirPath = path.join(getTempDirectory(), "firmware", "builds")

  let buildPath
  try {
    buildPath = versions[version]
  } catch (error) {
    throw new Error(`Version ${version} not found`)
  }

  const manifestPath = path.join(firmwareDirPath, buildPath)
  let otaManifest
  try {
    otaManifest = JSON.parse(
      fs.readFileSync(path.join(manifestPath, "ota.json"), "utf8")
    )
  } catch (error) {
    throw new Error(`Version ${version} not downloaded`)
  }

  // Get device info first
  const infoMessage = formatCanopyMessage("get", "info", {})
  const infoResp = await serialClient.sendCommand(JSON.stringify(infoMessage))
  const parsedInfoResp = parseCanopyMessage(JSON.parse(infoResp))
  
  if (!parsedInfoResp.success) {
    throw new Error("Failed to get device info")
  }

  // Skip if already up to date
  if (parsedInfoResp?.data?.version === version) {
    console.log(`Device already running ${version}, skipping firmware update`)
    return
  }

  console.log(`Current version: ${parsedInfoResp?.data?.version}, updating to: ${version}`)

  const chip = getDeviceChip(parsedInfoResp.data)
  const otaPath = getOtaPath(otaManifest, chip)
  
  // Get firmware file
  let firmwareFile
  try {
    firmwareFile = fs.readFileSync(path.join(manifestPath, otaPath))
  } catch (error) {
    throw new Error("Firmware file not found")
  }

  // Start OTA command
  const startReq = formatCanopyMessage("ota", "", { size: firmwareFile.length })
  const startResp = await serialClient.sendCommand(JSON.stringify(startReq))
  const startRespJson = JSON.parse(startResp)
  
  if (!startRespJson.result) {
    throw new Error(`Firmware update failed to start: ${startRespJson.error}`)
  }

  console.log("Firmware update started, sending data...")

  // Send OTA chunks
  const chunkSize = 8192
  let progress = 0
  for (let i = 0; i < firmwareFile.length; i += chunkSize) {
    const chunk = firmwareFile.subarray(i, i + chunkSize)
    const sent = await serialClient.sendBinary(Array.from(chunk))
    const sentJson = JSON.parse(sent)
    progress =
      sentJson.remaining === 0
        ? 1
        : sentJson.ota.progress /
          (sentJson.ota.remaining + sentJson.ota.progress)
    
    process.stdout.write(`\rProgress: ${Math.round(progress * 100)}%`)
    
    if (sentJson.ota.remaining === 0) {
      break
    }
  }
  
  console.log("\nFirmware update completed, device will restart...")
  
  // Wait a bit for device to restart
  await new Promise(resolve => setTimeout(resolve, 3000))
}

const flashNetwork = async (serialClient: SerialClient, ip: string, networkPath: string) => {
  const networkData = readFileSafe(networkPath)
  if (!networkData) {
    throw new Error("Could not read network config file")
  }
  
  const networkConfig = JSON5.parse(networkData)
  
  // Set params for name / host
  const params = {
    name: ip,
    hostname: ip.replace(/\./g, "-"),
    ip: ip,
  }

  // Update network config with IP-specific values
  let configToSend = JSON.parse(JSON.stringify(networkConfig.network))
  
  // Replace template variables
  const configStr = JSON.stringify(configToSend)
  const updatedConfigStr = configStr
    .replace(/\$name/g, params.name)
    .replace(/\$hostname/g, params.hostname)
    .replace(/\$ip/g, params.ip)
  
  configToSend = JSON.parse(updatedConfigStr)

  const networkMessage = formatCanopyMessage("set", "network", configToSend)
  const response = await serialClient.sendCommand(JSON.stringify(networkMessage))
  const parsedResponse = parseCanopyMessage(JSON.parse(response))
  
  if (!parsedResponse.success) {
    throw new Error(`Network config failed: ${parsedResponse.error}`)
  }
  
  console.log("Network configuration applied successfully")
}

const flashConfig = async (serialClient: SerialClient, ip: string, configPath: string) => {
  const configData = readFileSafe(configPath)
  if (!configData) {
    throw new Error("Could not read config file")
  }
  
  const config = JSON5.parse(configData)
  
  // Set params for name / host
  const params = {
    name: ip,
    hostname: ip.replace(/\./g, "-"),
    ip: ip,
  }

  // Apply each config section
  for (const key in config) {
    if (key === 'globals') {
      // Handle globals specially to set name
      let globalsConfig = { ...config[key] }
      globalsConfig.name = params.name
      
      const message = formatCanopyMessage("set", key, globalsConfig)
      const response = await serialClient.sendCommand(JSON.stringify(message))
      const parsedResponse = parseCanopyMessage(JSON.parse(response))
      
      if (!parsedResponse.success) {
        throw new Error(`Config update failed for ${key}: ${parsedResponse.error}`)
      }
      
      console.log(`Applied config: ${key}`)
    } else {
      // Apply other config sections as-is
      const message = formatCanopyMessage("set", key, config[key])
      const response = await serialClient.sendCommand(JSON.stringify(message))
      const parsedResponse = parseCanopyMessage(JSON.parse(response))
      
      if (!parsedResponse.success) {
        throw new Error(`Config update failed for ${key}: ${parsedResponse.error}`)
      }
      
      console.log(`Applied config: ${key}`)
    }
  }
  
  console.log("Controller configuration applied successfully")
}