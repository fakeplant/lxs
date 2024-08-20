import fs from "node:fs"
import path from "path"

export const findFixturesPath = (modelPath: string): string | null => {
  let currentPath = path.dirname(modelPath)
  while (currentPath !== "/") {
    const parentPath = path.dirname(currentPath)
    if (path.basename(currentPath) === "Models") {
      return path.join(parentPath, "Fixtures")
    }
    currentPath = parentPath
  }
  return null
}

export const findModelName = (modelPath: string): string => {
  return path.basename(modelPath).split(".")[0]
}

export const readFileSafe = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`)
    return null
  }
}

export const validatePath = (
  filePath: string,
  type: "file" | "directory"
): boolean => {
  try {
    const stats = fs.statSync(filePath)
    return type === "file" ? stats.isFile() : stats.isDirectory()
  } catch (error) {
    console.error(
      `${type === "file" ? "File" : "Directory"} does not exist at path: ${filePath}`
    )
    return false
  }
}

export const parseHostParam = (
  host: string,
  parameters: { [key: string]: any }
): string => {
  if (host.startsWith("$")) {
    const paramKey = host.slice(1)
    if (parameters && parameters[paramKey]) {
      return parameters[paramKey].default
    }
  }
  return host
}

export const ipLog = (
  ip: string,
  message: string,
  options: {
    success?: boolean
    error?: boolean
    clear?: boolean
    verbose?: boolean
  } = {}
) => {
  // clear the previous line
  if (options.clear && !options.verbose) {
    process.stdout.moveCursor(0, -1)
    process.stdout.clearLine(0)
  }

  // fix length of ip, pad with spaces
  ip = ip.padEnd(15, " ")

  // message
  if (options.error) {
    console.error(`${ip} : ${message}`)
  } else if (options.success) {
    console.log(`\x1b[32m%s\x1b[0m`, `${ip} : ${message}`)
  } else {
    console.log(`${ip} : ${message}`)
  }
}

export const ipLogClear = () => {
  process.stdout.moveCursor(0, -1)
  process.stdout.clearLine(0)
}
