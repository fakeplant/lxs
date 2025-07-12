import { Command } from "commander"
import { ipLog, readFileSafe } from "../utils"
import JSON5 from "json5"
import WebSocketClient from "../websocket"
import {
  formatCanopyMessage,
  isCanopyConfigMatch,
  parseCanopyMessage,
  parseCanopyRid,
} from "../canopy"

export const createNetworkCommand = () => {
  return new Command("network")
    .description("Validate controllers are up-to-date with.")
    .requiredOption("-i, --ips <path>", "path to the ips json file")
    .requiredOption("-c, --config <path>", "path to the config file")
    .action(async (options) => {
      const ipsPath = options.ips
      const configPath = options.config

      await validateControllersNetwork(ipsPath, configPath)

      process.exit(1)
    })
}

export const validateControllersNetwork = async (
  ipsPath: string,
  networkPath: string
) => {
  // Get IPs data
  const ipsData = readFileSafe(ipsPath)
  if (!ipsData) {
    console.error("Could not read ips file.")
    process.exit(1)
  }
  const ips = JSON5.parse(ipsData)

  // Get config data
  const configData = readFileSafe(networkPath)
  if (!configData) {
    console.error("Could not read config file.")
    process.exit(1)
  }
  const config = JSON5.parse(configData)

  // Validate each IP
  for (const ip of ips) {
    await validateControllerNetwork(ip, config)
  }

  return
}

export const validateControllerNetwork = async (ip: string, config: any) => {
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

  // Validate the network config
  await validateConfig(wsClient, ip, "network", config, { skipResponse: true })

  // Disconnect
  wsClient.disconnect()

  // Attempt to connect to the WebSocket again
  try {
    ipLog(ip, "Reconnecting", { clear: true })
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

  // Validate the network config
  await validateConfig(wsClient, ip, "network", config)
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