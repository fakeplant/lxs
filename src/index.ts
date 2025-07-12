#!/usr/bin/env node

import { Command } from "commander"
import packageJson from "../package.json"
import { createSyncCommand } from "./programs/sync"
import { createIpsCommand } from "./programs/ips"
import { createConfigCommand } from "./programs/config"
import { createNetworkCommand } from "./programs/network"
import { createFirmwareCommand } from "./programs/firmware"
import { createUpdateCommand } from "./programs/update"
import { createRecoverCommand } from "./programs/recover"

// Define program
const program = new Command()
program
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version)
  .showHelpAfterError()

// Register all commands
program.addCommand(createSyncCommand())
program.addCommand(createIpsCommand())
program.addCommand(createConfigCommand())
program.addCommand(createNetworkCommand())
program.addCommand(createFirmwareCommand())
program.addCommand(createUpdateCommand())
program.addCommand(createRecoverCommand())

// Run program
program.parse(process.argv)
