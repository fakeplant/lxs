#!/usr/bin/env node

import { Command } from "commander"
import packageJson from "../package.json"
import * as fs from "node:fs"
import "dotenv/config"
import JSON5 from "json5"
import * as fleece from "golden-fleece"

// Define program
const program = new Command()
program
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version)
  .showHelpAfterError()

// Create 'sync' command
program
  .command("sync")
  .description("Sync fixture with model.")
  .option("-m, --model <path>", "path to the model file")
  .option("-f, --fixtures <path>", "path to the fixtures directory")
  .action((options) => {
    // Handle options
    const optionsModelPath = options.model
    const optionsFixturesPath = options.fixtures
    const modelPath = optionsModelPath
      ? optionsModelPath
      : process.env.MODEL_FILE_PATH
    const fixturesPath = optionsFixturesPath
      ? optionsFixturesPath
      : process.env.FIXTURES_DIR_PATH

    // Validate paths are provided
    if (!modelPath) {
      console.log(
        "Include --model option to command or set MODEL_FILE_PATH environment variable in .env file"
      )
      process.exit(1)
    }
    if (!fixturesPath) {
      console.log(
        "Include --fixtures option to command or set FIXTURE_DIR_PATH environment variable in .env file"
      )
      process.exit(1)
    }

    // Validate paths are valid files/directories
    try {
      fs.accessSync(modelPath, fs.constants.F_OK)
    } catch (error) {
      console.error(`Model file does not exist at path: ${modelPath}`)
      process.exit(1)
    }
    try {
      fs.accessSync(fixturesPath, fs.constants.F_OK)
    } catch (error) {
      console.error(
        `Fixtures directory does not exist at path: ${fixturesPath}`
      )
      process.exit(1)
    }

    // Get model file
    const modelFile = fs.readFileSync(modelPath, "utf8") as any
    const modelFileJson = JSON5.parse(modelFile)

    // Iterate through fixture files and store changes
    let isModelChanged = false
    const modelFixtures = modelFileJson.fixtures
    for (const modelFixture of modelFixtures) {
      // Get Fixture file
      const fixturePath = modelFixture.jsonFixtureType
      const fixtureFile = fs.readFileSync(
        `${fixturesPath}/${fixturePath}.lxf`,
        "utf8"
      )
      const fixtureFileJson = JSON5.parse(fixtureFile)

      // Compare fixture file params
      let isChanged = false
      const modelFixtureParams = modelFixture.jsonParameters
      const fixtureParams = fixtureFileJson.parameters
      for (const fixtureParam of Object.entries(fixtureParams)) {
        const fixtureParamKey = fixtureParam[0]
        const fixtureParamObj = fixtureParam[1] as any
        const fixtureParamDefaultValue = fixtureParamObj.default
        const matchingModelFixtureParam = modelFixtureParams[fixtureParamKey]

        if (fixtureParamDefaultValue !== matchingModelFixtureParam) {
          console.log(
            `Updating fixture param: ${fixturePath} - ${fixtureParamKey}: ${fixtureParamDefaultValue} -> ${matchingModelFixtureParam}`
          )
          fixtureParamObj.default = matchingModelFixtureParam
          isChanged = true
        }
      }

      // Write changes to fixture file
      // Use 'fleece' to preserve JSON5 formatting
      if (isChanged) {
        isModelChanged = true
        const file = fleece.patch(fixtureFile, fixtureFileJson)
        fs.writeFileSync(`${fixturesPath}/${fixturePath}.lxf`, file)
      }
    }

    // Backup message
    if (isModelChanged) {
      console.log("Fixtures updated.")
    } else {
      console.log("Fixtures already up-to-date.")
    }
  })

// Run program
program.parse(process.argv)
