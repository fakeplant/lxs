import { Command } from "commander"
import { downloadFirmware } from "../firmware/download"

export const createFirmwareCommand = () => {
  return new Command("firmware [project]")
    .option("-v, --version <0.0.0>", "download a single version")
    .description("Download controller firmware versions to computer.")
    .action(async (project, options) => {
      const version = options.version

      if (!version) {
        console.error("Please specify a version to download with --version")
        process.exit(1)
      }

      await downloadFirmware(version)
      console.log("Firmware downloaded.")
      process.exit(1)
    })
}
