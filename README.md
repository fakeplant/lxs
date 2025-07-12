# LXS (LX Sync)

A command-line tool for managing LED controller devices. Provides functionality for firmware updates, configuration management, and device recovery across multiple deployment scenarios.

## Features

- 🔄 **Fixture Synchronization** - Sync model parameter changes back to fixture files
- 📱 **Wireless Updates** - Update controller firmware and configuration over network
- 🔌 **Serial Flashing** - Flash controllers via USB/serial connection
- 🌐 **Network Management** - Configure IP addresses, hostnames, and network settings
- 🚑 **Device Recovery** - Recover controllers after failed updates
- 📦 **Project Management** - Organize configurations by project

## Quick Start

```bash
# Install dependencies and build
npm install && npm run build && npm link

# Download firmware
lxs firmware --version 0.12.10

# Generate IP list for project
lxs ips mothership

# Update all controllers
lxs update mothership --version 0.12.10
```

## Documentation

📖 **[Complete Documentation](docs.md)** - Detailed command reference, workflows, and examples

## Install

1. Install the dependencies:

```bash
$ npm install
```

2. Optional: Rename `.env.example` to `.env` and fill in the required values.


3. Build the project:

```bash
$ npm run build
```

4. Link the package:

```bash
$ npm link
```


## Usage

Basic usage with no arguments (using .env variables):
```bash
$ lxs sync
```

Usage with arguments:
```bash
$ lxs sync --model=../<model_path.lxf> --fixtures=../<fixtures_dir> 
```

## Development

Run npm link

```bash
$ npm link
```

Start watch to build after file changes

```bash
$ npm run watch
```

Run commands...

```bash
$ lxs --help
```

## Formatting
The code is formatted using [Prettier](https://prettier.io/). 

Settings are found in the `.prettierrc.json` file.

Setup automatic formatting in your editor by following the instructions [here](https://prettier.io/docs/en/editors.html)


