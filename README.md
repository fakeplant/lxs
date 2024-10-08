# LXS (LX Sync)
Used to to sync [Chromatik](https://chromatik.co/) model file (.lxm) parameter changes back to original fixture files (.lxf).
Also includes a bunch of helper functions for managing [Chroma.tech](https://chroma.tech) controllers with Chromatik projects.


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



### Running the project

```bash
$ npx tsx src/index.ts <command>
```

### Building

To build the project:

```bash
$ npm run build
```

### Formatting
The code is formatted using [Prettier](https://prettier.io/). 

Settings are found in the `.prettierrc.json` file.

Setup automatic formatting in your editor by following the instructions [here](https://prettier.io/docs/en/editors.html)
