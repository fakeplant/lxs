import fs from "node:fs"
import path from "path"
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

export const loadProjectConfig = (projectName: string): ProjectConfig | null => {
  const projectDir = path.join(process.cwd(), "projects", projectName)
  
  if (!fs.existsSync(projectDir)) {
    console.error(`Project '${projectName}' not found in projects directory`)
    return null
  }

  const config: ProjectConfig = {
    name: projectName
  }

  // Load model.json for model and fixtures paths
  const modelJsonPath = path.join(projectDir, "model.json")
  const modelData = readFileSafe(modelJsonPath)
  if (modelData) {
    try {
      const modelJson = JSON5.parse(modelData)
      config.modelPath = modelJson.modelFilePath?.replace("~", process.env.HOME || "")
      config.fixturesPath = modelJson.fixturesDirPath?.replace("~", process.env.HOME || "")
    } catch (error) {
      console.warn(`Warning: Could not parse model.json for project ${projectName}`)
    }
  }

  // Set paths for other config files
  config.configPath = path.join(projectDir, "config.json")
  config.networkPath = path.join(projectDir, "network.json")
  config.firmwarePath = path.join(projectDir, "firmware.json")
  
  // Check for generated IPs file
  const tempIpsPath = path.join(process.cwd(), "temp", projectName, "ips.json")
  if (fs.existsSync(tempIpsPath)) {
    config.ipsPath = tempIpsPath
  }

  return config
}

export const listAvailableProjects = (): string[] => {
  const projectsDir = path.join(process.cwd(), "projects")
  
  if (!fs.existsSync(projectsDir)) {
    return []
  }

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
}

export const validateProjectExists = (projectName: string): boolean => {
  const projectDir = path.join(process.cwd(), "projects", projectName)
  return fs.existsSync(projectDir)
}