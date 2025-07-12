# LXS CLI Documentation

## Table of Contents

- [Overview](#overview)
- [Project Configuration](#project-configuration)
- [Commands](#commands)
  - [sync](#sync)
  - [ips](#ips)
  - [config](#config)
  - [network](#network)
  - [firmware](#firmware)
  - [update](#update)
  - [recover](#recover)
  - [flash](#flash)
- [Workflows](#workflows)
  - [Setting up a new project](#setting-up-a-new-project)
  - [Updating controllers wirelessly](#updating-controllers-wirelessly)
  - [Flashing controllers via serial](#flashing-controllers-via-serial)
  - [Recovery operations](#recovery-operations)

## Overview

LXS is a command-line tool for managing LED controller devices. It provides functionality for firmware updates, configuration management, and device recovery across multiple deployment scenarios.

All commands support both **project-based** and **manual** modes:
- **Project mode**: `lxs <command> <project>` - automatically uses project configuration
- **Manual mode**: `lxs <command> --option value` - requires explicit parameters

## Project Configuration

Projects are stored in the `projects/` directory with the following structure:

```
projects/
├── mothership/
│   ├── config.json      # Controller configuration
│   ├── network.json     # Network settings
│   ├── firmware.json    # Firmware version
│   └── model.json       # Model and fixtures paths
└── te/
    ├── config.json
    ├── network.json
    ├── firmware.json
    └── model.json
```

### Example Project Files

**model.json**
```json
{
  "modelFilePath": "~/projects/LXStudio/Models/Project.lxm",
  "fixturesDirPath": "~/projects/LXStudio/Fixtures"
}
```

**firmware.json**
```json
{
  "version": "0.12.10"
}
```

**network.json**
```json
{
  "network": {
    "hostname": "$hostname",
    "ethernet": {
      "ip": "$ip",
      "subnet": "255.255.0.0", 
      "gateway": "10.0.0.1"
    },
    "wifi": {
      "ssid": "",
      "password": "",
      "ip": "",
      "subnet": "",
      "gateway": ""
    }
  }
}
```

**config.json**
```json
{
  "artnet": {
    "universes": [[10, 0, 170, 0]]
  },
  "globals": {
    "name": "$name",
    "debug": false
  },
  "leds": {
    "chipset": "SK9822",
    "speed": 2000000,
    "length": 400,
    "color_order": "BGR"
  },
  "power": {
    "internal": [],
    "external": []
  }
}
```

## Commands

### sync

Synchronizes fixture parameters between model and fixture files.

**Usage:**
```bash
# Project mode
lxs sync <project>

# Manual mode  
lxs sync --model <path> [--fixtures <path>]
```

**Examples:**
```bash
lxs sync mothership
lxs sync --model ~/Models/show.lxm --fixtures ~/Fixtures
```

**What it does:**
- Reads the model file to get fixture parameter values
- Updates corresponding fixture files with new default values
- Only updates parameters that have changed
- Preserves fixture file formatting using golden-fleece

---

### ips

Generates a list of controller IP addresses from model and fixture files.

**Usage:**
```bash
# Project mode
lxs ips <project> [--output <path>] [--name <name>]

# Manual mode
lxs ips --model <path> [--fixtures <path>] [--output <path>] [--name <name>]
```

**Examples:**
```bash
lxs ips mothership
lxs ips mothership --output ./custom-output
lxs ips --model ~/Models/show.lxm --fixtures ~/Fixtures --name myshow
```

**What it does:**
- Recursively parses model and fixture files
- Extracts IP addresses from output configurations
- Resolves parameter references (e.g., `$ip` → actual IP)
- Saves IP list to `temp/<project>/ips.json`
- Ignores specified fixture types (point, points, strip, arc)

---

### config

Validates and updates controller configuration over network.

**Usage:**
```bash
# Project mode (interactive IP selection)
lxs config <project> [--key <key>]

# Manual mode
lxs config --ips <path> --config <path> [--key <key>]
```

**Examples:**
```bash
lxs config mothership
lxs config mothership --key leds
lxs config --ips ./ips.json --config ./config.json
```

**Interactive IP Selection (Project Mode):**
1. **All IPs** - Update all controllers in project
2. **Single IP** - Select one IP from numbered list  
3. **Custom IP** - Enter any IP address manually

**What it does:**
- Connects to controllers via WebSocket (port 81)
- Compares current config with desired config
- Updates only changed configuration sections
- Supports filtering by config key with `--key`
- Replaces template variables (`$name`, `$ip`, `$hostname`)

---

### network

Validates and updates network configuration over network.

**Usage:**
```bash
# Project mode (interactive IP selection)
lxs network <project>

# Manual mode
lxs network --ips <path> --config <path>
```

**Examples:**
```bash
lxs network mothership
lxs network --ips ./ips.json --config ./network.json
```

**What it does:**
- Updates network settings (IP, subnet, gateway, hostname)
- Handles connection interruption during network changes
- Automatically reconnects to verify changes
- Replaces template variables with actual values
- Uses same interactive IP selection as config command

---

### firmware

Downloads firmware versions from cloud storage.

**Usage:**
```bash
# Download specific version
lxs firmware [project] --version <version>
```

**Examples:**
```bash
lxs firmware --version 0.12.10
lxs firmware mothership --version 0.12.10
```

**What it does:**
- Downloads firmware from Google Cloud Storage
- Saves to `temp/firmware/builds/`
- Creates `versions.json` mapping
- Supports version filtering to reduce download size
- Required before using `update` command

---

### update

Updates controller firmware over network.

**Usage:**
```bash
# Project mode (interactive IP selection)  
lxs update <project> --version <version>

# Manual mode
lxs update --ips <path> --version <version>
```

**Examples:**
```bash
lxs update mothership --version 0.12.10
lxs update --ips ./ips.json --version 0.12.10
```

**What it does:**
- Validates firmware version exists locally
- Backs up network settings before update
- Performs OTA (Over-The-Air) firmware update
- Shows progress during upload
- Automatically detects device chip type
- Resets device after successful update

---

### recover

Recovers network settings after failed firmware updates.

**Usage:**
```bash
lxs recover [project]
```

**Examples:**
```bash
lxs recover
lxs recover mothership
```

**What it does:**
- Scans for controllers using mDNS discovery
- Looks for `_chromatech-config._tcp` services
- Restores network settings from backup files
- Useful when controllers lose network connectivity
- Automatically processes all discovered devices

---

### flash

Flashes controllers via serial connection (firmware + network + config).

**Usage:**
```bash
lxs flash <project> <ip> [--version <version>]
```

**Examples:**
```bash
lxs flash mothership 10.7.100.50
lxs flash mothership 10.7.100.50 --version 0.12.10
```

**What it does:**
1. **Waits for serial device** - Detects ESP32/CH340 devices
2. **Firmware update** - Flashes firmware over serial using OTA protocol  
3. **Network configuration** - Sets IP, hostname, and network settings
4. **Controller configuration** - Applies all config sections (LEDs, power, etc.)
5. **Waits for disconnection** - Prompts to unplug device when complete

**Supported Serial Devices:**
- ESP32-S3 (303a:1001)
- CH340 (1a86:7523)  
- ESP32-C3 (303a:814e, 303a:814f)

## Workflows

### Setting up a new project

1. **Create project directory:**
```bash
mkdir projects/myproject
```

2. **Create configuration files:**
```bash
# Copy from existing project or create new
cp projects/mothership/* projects/myproject/
```

3. **Update model.json with your paths:**
```json
{
  "modelFilePath": "~/path/to/your/model.lxm",
  "fixturesDirPath": "~/path/to/your/fixtures"
}
```

4. **Generate IP list:**
```bash
lxs ips myproject
```

### Updating controllers wirelessly

1. **Download firmware:**
```bash
lxs firmware --version 0.12.10
```

2. **Update all controllers:**
```bash
lxs update myproject --version 0.12.10
# Select "All IPs" when prompted
```

3. **Update configuration:**
```bash
lxs config myproject
# Select "All IPs" when prompted  
```

### Flashing controllers via serial

1. **Flash single controller:**
```bash
lxs flash myproject 10.7.100.50
```

2. **Process multiple controllers:**
```bash
# Flash each controller individually
lxs flash myproject 10.7.100.51
lxs flash myproject 10.7.100.52
# etc...
```

### Recovery operations

1. **Recover network settings after failed update:**
```bash
lxs recover myproject
```

2. **Update network configuration:**
```bash
lxs network myproject
```

3. **Verify configuration:**
```bash
lxs config myproject --key globals
```

## Template Variables

Configuration files support template variable replacement:

| Variable | Description | Example |
|----------|-------------|---------|
| `$ip` | Controller IP address | `10.7.100.50` |
| `$hostname` | IP with dots replaced by dashes | `10-7-100-50` |
| `$name` | Same as IP | `10.7.100.50` |

These are automatically replaced when applying configurations to controllers.

## File Locations

All temporary and generated files are stored relative to the CLI installation:

```
lxs/
├── projects/           # Project configurations
├── temp/
│   ├── <project>/
│   │   └── ips.json   # Generated IP lists
│   ├── controllers/
│   │   └── <uid>/
│   │       └── network.json  # Network backups
│   └── firmware/
│       ├── versions.json     # Version mappings
│       └── builds/           # Downloaded firmware
└── src/               # Source code
```

This ensures consistent file locations regardless of where the CLI is executed from.