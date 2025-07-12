import { Command } from "commander"
import {
  findFixturesPath,
  readFileSafe,
  validatePath,
} from "../utils"
import JSON5 from "json5"
import fleece from "golden-fleece"
import fs from "node:fs"
import path from "path"

export const createSyncCommand = () => {
  return new Command("sync")
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
}