import fs from "node:fs"
import path from "path"
import { fileURLToPath } from "node:url"
import JSON5 from "json5"
import { readFileSafe } from "./utils"

export interface ProjectConfig {
  name: string
  modelPath?: string
  fixturesPath?: string
  configPath?: string
  networkPath?: string
  firmwarePath?: string
  ipsPath?: string
}

const getModuleRoot = (): string => {
  // Get the directory where this file is located
  const currentFileUrl = import.meta.url
  const currentFilePath = fileURLToPath(currentFileUrl)
  
  // Go up from src/project.ts to root
  // src/project.ts -> src -> root
  return path.dirname(path.dirname(currentFilePath))
}

const getProjectsDirectory = (): string => {
  return path.join(getModuleRoot(), "projects")
}

export const getTempDirectory = (): string => {
  return path.join(getModuleRoot(), "temp")
}

export const loadProjectConfig = (
  projectName: string
): ProjectConfig | null => {
  const projectsDir = getProjectsDirectory()
  const projectDir = path.join(projectsDir, projectName)

  if (!fs.existsSync(projectDir)) {
    console.error(`Project '${projectName}' not found in: ${projectsDir}`)
    return null
  }

  const config: ProjectConfig = {
    name: projectName,
  }

  // Load model.json for model and fixtures paths
  const modelJsonPath = path.join(projectDir, "model.json")
  const modelData = readFileSafe(modelJsonPath)
  if (modelData) {
    try {
      const modelJson = JSON5.parse(modelData)
      config.modelPath = modelJson.modelFilePath?.replace(
        "~",
        process.env.HOME || ""
      )
      config.fixturesPath = modelJson.fixturesDirPath?.replace(
        "~",
        process.env.HOME || ""
      )
    } catch (error) {
      console.warn(
        `Warning: Could not parse model.json for project ${projectName}`
      )
    }
  }

  // Set paths for other config files
  config.configPath = path.join(projectDir, "config.json")
  config.networkPath = path.join(projectDir, "network.json")
  config.firmwarePath = path.join(projectDir, "firmware.json")

  // Check for generated IPs file
  const tempIpsPath = path.join(getTempDirectory(), projectName, "ips.json")
  if (fs.existsSync(tempIpsPath)) {
    config.ipsPath = tempIpsPath
  }

  return config
}

export const listAvailableProjects = (): string[] => {
  const projectsDir = getProjectsDirectory()

  if (!fs.existsSync(projectsDir)) {
    return []
  }

  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
}

export const validateProjectExists = (projectName: string): boolean => {
  const projectsDir = getProjectsDirectory()
  const projectDir = path.join(projectsDir, projectName)
  return fs.existsSync(projectDir)
}
