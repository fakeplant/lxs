#!/usr/bin/env node

import { Command } from "commander"
import packageJson from "../package.json"
import {
  findFixturesPath,
  readFileSafe,
  validatePath,
  parseHostParam,
  findModelName,
  ipLog,
} from "./utils"
import JSON5 from "json5"
import fleece from "golden-fleece"
import fs from "node:fs"
import path from "path"
import WebSocketClient from "./websocket"
import {
  formatCanopyMessage,
  isCanopyConfigMatch,
  parseCanopyMessage,
  parseCanopyRid,
} from "./canopy"

// Define program
const program = new Command()
program
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version)
  .showHelpAfterError()

// Sync command
program
  .command("sync")
  .description("Sync fixture with model.")
  .requiredOption("-m, --model <path>", "path to the model file")
  .option("-f, --fixtures <path>", "path to the fixtures directory")
  .action((options) => {
    const modelPath = options.model
    let fixturesPath = options.fixtures || findFixturesPath(modelPath)

    if (
      !validatePath(modelPath, "file") ||
      !validatePath(fixturesPath, "directory")
    ) {
      console.error("Invalid path provided for model or fixtures.")
      process.exit(1)
    }

    const modelData = readFileSafe(modelPath)
    if (!modelData) {
      console.error("Failed to read model file.")
      process.exit(1)
    }
    const modelJson = JSON5.parse(modelData)
    let isModelChanged = false

    modelJson.fixtures.forEach((fixture: any) => {
      const fixtureFilePath = path.join(
        fixturesPath,
        `${fixture.jsonFixtureType}.lxf`
      )
      const fixtureData = readFileSafe(fixtureFilePath)
      if (!fixtureData) {
        console.error(`Failed to read fixture file at ${fixtureFilePath}`)
        return // continue to next fixture
      }
      const fixtureJson = JSON5.parse(fixtureData)
      let isChanged = false

      const fixtureParams = fixtureJson.parameters
      const modelFixtureParams = fixture.parameters

      for (const key in fixtureParams) {
        if (
          modelFixtureParams.hasOwnProperty(key) &&
          fixtureParams[key].default !== modelFixtureParams[key]
        ) {
          console.log(
            `Updating fixture param: ${fixture.jsonFixtureType} - ${key}: ${fixtureParams[key].default} -> ${modelFixtureParams[key]}`
          )
          fixtureParams[key].default = modelFixtureParams[key]
          isChanged = true
        }
      }

      if (isChanged) {
        const updatedFixtureData = fleece.patch(fixtureData, {
          parameters: fixtureParams,
        })
        fs.writeFileSync(fixtureFilePath, updatedFixtureData)
        isModelChanged = true
      }
    })

    if (isModelChanged) {
      console.log("Fixtures updated.")
    } else {
      console.log("Fixtures already up-to-date.")
    }
  })

// Create 'ips' command
program
  .command("ips")
  .description(
    "Output controller IP list for fixtures derived from a model file."
  )
  .requiredOption("-m, --model <path>", "path to the model file")
  .option("-f, --fixtures <path>", "path to the fixtures directory")
  .option("-n, --name <name>", "name of the output file")
  .option("-o, --output <path>", "path to the output directory")
  .action((options) => {
    const modelPath = options.model
    let fixturesPath = options.fixtures || findFixturesPath(modelPath)
    const outputDir = options.output || "./temp/ips"
    const name = options.name || findModelName(modelPath)

    parseModelIPs(modelPath, fixturesPath, name, outputDir)

    process.exit(1)
  })

// Create 'validate' command
program
  .command("validate")
  .description("Validate controllers are up-to-date with.")
  .requiredOption("-i, --ips <path>", "path to the ips json file")
  .requiredOption("-c, --config <path>", "path to the config file")
  .option("-k, --key <key>", "only validate config for single key")
  .action(async (options) => {
    const ipsPath = options.ips
    const configPath = options.config
    const keyFilter = options.key

    await validateControllersConfig(ipsPath, configPath, keyFilter)

    process.exit(1)
  })

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
    // Filter keys if in options
    if (keyFilter) {
      if (key !== keyFilter) {
        ipLog(ip, `${key}: Skipped`)
        continue
      }
    }

    const value = config[key]

    // Send command to controller
    try {
      // First we "get" the current config values for the key
      const message = formatCanopyMessage("get", key, value)
      const stringifiedMessage = JSON.stringify(message)

      // Validate rid of response (in case other commands are sent)
      const response = await wsClient.sendCommand(stringifiedMessage)
      const parsedRid = parseCanopyRid(JSON.parse(response))
      if (!parsedRid || parsedRid !== message._rid) {
        ipLog(ip, `${key}: Invalid rid`, { error: true })
        continue
      }

      // Set params for name / host
      const params = {
        name: ip,
        hostname: ip.replace(/\./g, "-"),
        ip: ip,
      }

      // Parse the response and validate it to the config object
      const parsedResponse = parseCanopyMessage(JSON.parse(response))
      // console.log(key, parsedResponse)
      if (!parsedResponse.success) {
        ipLog(ip, `${key}: ${parsedResponse.error}`, { error: true })
        continue
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

      // console.log(parsedRid)
    } catch (error) {
      ipLog(ip, `${key}: Error`, { error: true })
    }
  }
}

export const parseModelIPs = (
  modelPath: string,
  fixturesPath: string,
  outputFileName: string,
  outputDir: string
) => {
  const modelData = readFileSafe(modelPath)
  if (!modelData) {
    console.error("Could not read model file.")
    process.exit(1)
  }
  const model = JSON5.parse(modelData)
  const ipSet = new Set<string>()

  model.fixtures.forEach((fixture: { jsonFixtureType: string }) => {
    console.log(`Parsing fixture: ${fixture}`)
    const fixturePath = path.join(
      fixturesPath,
      `${fixture.jsonFixtureType}.lxf`
    )
    parseFixtureIPs(fixturePath, path.dirname(fixturePath), ipSet, [
      "point",
      "points",
      "strip",
      "arc",
    ])
  })

  const ipList = Array.from(ipSet)
  console.log(ipList)

  // Write output to file
  const outputFilePath = path.join(outputDir, `${outputFileName}.json`)
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(ipList, null, 2))
  console.log(`Output written to ${outputFilePath}`)
}

export const parseFixtureIPs = (
  filePath: string,
  basePath: string,
  ipSet: Set<string>,
  ignoreTypes: string[] = []
) => {
  const data = readFileSafe(filePath)
  if (!data) return

  const config = JSON5.parse(data)
  if (!config || !config.components) return

  config.components.forEach((component: { type: string }) => {
    if (ignoreTypes.includes(component.type)) return

    const componentPath = path.join(
      basePath,
      component.type.replace(/\//g, path.sep) + ".lxf"
    )
    parseFixtureIPs(
      componentPath,
      path.dirname(componentPath),
      ipSet,
      ignoreTypes
    )
  })

  if (config.outputs) {
    config.outputs.forEach((output: any) => {
      let host = output.host
      if (host.startsWith("$")) {
        const paramKey = host.slice(1)
        if (config.parameters && config.parameters[paramKey]) {
          host = config.parameters[paramKey].default
        }
      }
      ipSet.add(host)
    })
  }
}

// Create a new function called 'validate' that takes a path  to a json file

// Run program
program.parse(process.argv)
