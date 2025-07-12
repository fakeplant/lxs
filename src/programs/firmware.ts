import { Command } from "commander"
import { downloadFirmware } from "../firmware/download"

export const createFirmwareCommand = () => {
  return new Command("firmware")
    .option("-v, --version <0.0.0>", "download a single version")
    .description("Download controller firmware versions to computer.")
    .action(async (options) => {
      const version = options.version
      await downloadFirmware(version)
      console.log("Firmware downloaded.")
      process.exit(1)
    })
}