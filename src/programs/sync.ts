import { Command } from "commander"
import {
  findFixturesPath,
  readFileSafe,
  validatePath,
} from "../utils"
import { loadProjectConfig } from "../project"
import JSON5 from "json5"
import fleece from "golden-fleece"
import fs from "node:fs"
import path from "path"

export const createSyncCommand = () => {
  const command = new Command("sync")
  command
    .argument("[project]", "optional project name")
    .description("Sync fixture with model.")
    .addHelpText('after', `
Examples:
  lxs sync mothership                           # sync using project config
  lxs sync --model ~/show.lxm --fixtures ~/f   # sync using explicit paths

This command synchronizes parameter values from a model file back to the 
original fixture files. Only parameters that have changed are updated,
preserving the original fixture file formatting.`)
    .option("-m, --model <path>", "path to the model file")
    .option("-f, --fixtures <path>", "path to the fixtures directory")
    .action((project, options) => {
      let modelPath: string
      let fixturesPath: string

      if (project) {
        // Use project configuration
        const projectConfig = loadProjectConfig(project)
        if (!projectConfig) {
          process.exit(1)
        }

        modelPath = options.model || projectConfig.modelPath
        fixturesPath = options.fixtures || projectConfig.fixturesPath

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
      }

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
  
  return command
}