import { Command } from "commander"
import { ipLog, readFileSafe } from "../utils"
import { loadProjectConfig } from "../project"
import { promptIPSelection } from "../interactive"
import JSON5 from "json5"
import WebSocketClient from "../websocket"
import {
  formatCanopyMessage,
  isCanopyConfigMatch,
  parseCanopyMessage,
  parseCanopyRid,
} from "../canopy"

export const createConfigCommand = () => {
  const command = new Command("config")
  command
    .argument("[project]", "optional project name")
    .description("Validate controllers are up-to-date with.")
    .option("-i, --ips <path>", "path to the ips json file")
    .option("-c, --config <path>", "path to the config file")
    .option("-k, --key <key>", "only validate config for single key")
    .action(async (project, options) => {
      let ipsPath: string
      let configPath: string
      let keyFilter = options.key

      if (project) {
        // Use project configuration
        const projectConfig = loadProjectConfig(project)
        if (!projectConfig) {
          process.exit(1)
        }

        ipsPath = options.ips || projectConfig.ipsPath
        configPath = options.config || projectConfig.configPath

        if (!ipsPath) {
          console.error(`Project '${project}' does not have IPs generated. Run 'lxs ips ${project}' first.`)
          process.exit(1)
        }
        if (!configPath) {
          console.error(`Project '${project}' does not have a config file`)
          process.exit(1)
        }

        // Interactive IP selection for project mode
        try {
          const ipSelection = await promptIPSelection(ipsPath)
          await validateControllersConfigWithIPs(ipSelection.ips, configPath, keyFilter)
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Unknown error")
          process.exit(1)
        }
      } else {
        // Manual mode - require options
        if (!options.ips) {
          console.error("--ips is required when no project is specified")
          process.exit(1)
        }
        if (!options.config) {
          console.error("--config is required when no project is specified")
          process.exit(1)
        }
        
        ipsPath = options.ips
        configPath = options.config

        await validateControllersConfig(ipsPath, configPath, keyFilter)
      }

      process.exit(1)
    })
  
  return command
}

export const validateControllersConfig = async (
  ipsPath: string,
  configPath: string,
  keyFilter?: string
) => {
  // Get IPs data
  const ipsData = readFileSafe(ipsPath)
  if (!ipsData) {
    console.error("Could not read ips file.")
    process.exit(1)
  }
  const ips = JSON5.parse(ipsData)

  await validateControllersConfigWithIPs(ips, configPath, keyFilter)
}

export const validateControllersConfigWithIPs = async (
  ips: string[],
  configPath: string,
  keyFilter?: string
) => {
  // Get config data
  const configData = readFileSafe(configPath)
  if (!configData) {
    console.error("Could not read config file.")
    process.exit(1)
  }
  const config = JSON5.parse(configData)

  // Validate each IP
  for (const ip of ips) {
    await validateControllerConfig(ip, config, keyFilter)
  }

  return
}

export const validateControllerConfig = async (
  ip: string,
  config: any,
  keyFilter?: string
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
  ipLog(ip, "Validating", { clear: true })

  // Validate the config
  for (const key in config) {
    await validateConfig(wsClient, ip, key, config, { keyFilter: keyFilter })
  }
}

const validateConfig = async (
  wsClient: WebSocketClient,
  ip: string,
  key: string,
  config: any,
  options?: {
    skipResponse?: boolean
    keyFilter?: string
  }
) => {
  // Filter keys if in options
  if (options?.keyFilter) {
    if (key !== options.keyFilter) {
      ipLog(ip, `${key}: Skipped`)
      return
    }
  }

  const value = config[key]

  // Send command to controller
  try {
    // First we "get" the current config values for the key
    const message = formatCanopyMessage("get", key, {})
    const stringifiedMessage = JSON.stringify(message)

    // Validate rid of response (in case other commands are sent)
    const response = await wsClient.sendCommand(
      stringifiedMessage,
      options?.skipResponse
    )
    if (options?.skipResponse) {
      return
    }
    const parsedRid = parseCanopyRid(JSON.parse(response))
    if (!parsedRid || parsedRid !== message._rid) {
      ipLog(ip, `${key}: Invalid rid`, { error: true })
      return
    }

    // Set params for name / host
    const params = {
      name: ip,
      hostname: ip.replace(/\./g, "-"),
      ip: ip,
    }

    // Parse the response and validate it to the config object
    const parsedResponse = parseCanopyMessage(JSON.parse(response))
    if (!parsedResponse.success) {
      ipLog(ip, `${key}: ${parsedResponse.error}`, { error: true })
      return
    }
    const isValid = isCanopyConfigMatch(
      parsedResponse.data,
      config[key],
      params
    )

    // If the config is not valid, update the controller
    if (!isValid) {
      const message = formatCanopyMessage("set", key, value)
      const stringifiedMessage = JSON.stringify(message)
      await wsClient.sendCommand(stringifiedMessage)
      ipLog(ip, `${key}: Updated`, { success: true })
    } else {
      ipLog(ip, `${key}: Up to date`)
    }
  } catch (error) {
    ipLog(ip, `${key}: Error`, { error: true })
  }
}