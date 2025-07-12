import { Command } from "commander"
import {
  findFixturesPath,
  findModelName,
  readFileSafe,
} from "../utils"
import { loadProjectConfig } from "../project"
import JSON5 from "json5"
import fs from "node:fs"
import path from "path"

export const createIpsCommand = () => {
  return new Command("ips [project]")
    .description(
      "Output controller IP list for fixtures derived from a model file."
    )
    .option("-m, --model <path>", "path to the model file")
    .option("-f, --fixtures <path>", "path to the fixtures directory")
    .option("-n, --name <name>", "name of the output file")
    .option("-o, --output <path>", "path to the output directory")
    .action((project, options) => {
      let modelPath: string
      let fixturesPath: string
      let name: string
      let outputDir: string

      if (project) {
        // Use project configuration
        const projectConfig = loadProjectConfig(project)
        if (!projectConfig) {
          process.exit(1)
        }

        modelPath = options.model || projectConfig.modelPath
        fixturesPath = options.fixtures || projectConfig.fixturesPath
        name = options.name || project
        outputDir = options.output || `./temp/${project}`

        if (!modelPath) {
          console.error(`Project '${project}' does not have a model path configured`)
          process.exit(1)
        }
        if (!fixturesPath) {
          console.error(`Project '${project}' does not have a fixtures path configured`)
          process.exit(1)
        }
      } else {
        // Manual mode - require options
        if (!options.model) {
          console.error("--model is required when no project is specified")
          process.exit(1)
        }
        
        modelPath = options.model
        fixturesPath = options.fixtures || findFixturesPath(modelPath)
        name = options.name || findModelName(modelPath)
        outputDir = options.output || `./temp/${name}`
      }

      parseModelIPs(modelPath, fixturesPath, outputDir)

      process.exit(1)
    })
}

export const parseModelIPs = (
  modelPath: string,
  fixturesPath: string,
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
  const outputFilePath = path.join(outputDir, `ips.json`)
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