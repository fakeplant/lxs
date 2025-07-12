import { Command } from "commander"
import { downloadFirmware } from "../firmware/download"
import { loadProjectConfig } from "../project"
import { readFileSafe } from "../utils"
import JSON5 from "json5"

export const createFirmwareCommand = () => {
  const command = new Command("firmware")
  command
    .argument("[project]", "optional project name")
    .option("-v, --version <0.0.0>", "download a single version")
    .description("Download controller firmware versions to computer.")
    .addHelpText('after', `
Examples:
  lxs firmware --version 0.12.10               # download specific version
  lxs firmware mothership --version 0.12.10    # same as above

This command downloads firmware from Google Cloud Storage and saves it
to temp/firmware/builds/. The firmware must be downloaded before using
the 'update' or 'flash' commands.`)
    .action(async (project, options) => {
      let version: string

      if (project) {
        // Use project configuration
        const projectConfig = loadProjectConfig(project)
        if (!projectConfig) {
          process.exit(1)
        }

        // Try to get version from project's firmware.json
        version = options.version
        if (!version && projectConfig.firmwarePath) {
          const firmwareData = readFileSafe(projectConfig.firmwarePath)
          if (firmwareData) {
            try {
              const firmwareConfig = JSON5.parse(firmwareData)
              version = firmwareConfig.version
              console.log(`Using version ${version} from project firmware config`)
            } catch (error) {
              console.warn(`Warning: Could not parse firmware.json for project ${project}`)
            }
          }
        }

        if (!version) {
          console.error(`Project '${project}' does not have a firmware version configured and --version not provided`)
          process.exit(1)
        }
      } else {
        // Manual mode - require version option
        version = options.version
        if (!version) {
          console.error("Please specify a version to download with --version")
          process.exit(1)
        }
      }

      await downloadFirmware(version)
      console.log("Firmware downloaded.")
      process.exit(1)
    })
  
  return command
}
