import { Storage } from "@google-cloud/storage"
import { File } from "@google-cloud/storage/build/cjs/src/file"
import semver from "semver"

import { CHROMATECH_GCS_BUCKET_NAME, MIN_OTA_FIRMWARE_VERSION } from "./const"
import { FirmwareBuild, FirmwareVersionRecord } from "./types"

export const getTimberVersions = async (): Promise<FirmwareVersionRecord> => {
  // Creates a client using Application Default Credentials
  const storage = new Storage()

  // Options
  const prefix = "timber/versions/"
  const options = {
    prefix: prefix,
  }

  // Get all versions
  const [versionFiles] = await storage
    .bucket(CHROMATECH_GCS_BUCKET_NAME)
    .getFiles(options)

  const versions = await Promise.all(
    versionFiles.map(async (value: File, index: number, array: File[]) => {
      const file = value

      // Version
      const version = file.name.replace(prefix, "")
      const cleanedVersion = semver.clean(version)

      // Filter out versions that are not valid semver
      const isValid = cleanedVersion && semver.valid(cleanedVersion)
      if (!isValid) {
        return {}
      }

      // Filter out min version that supports OTA
      if (semver.lt(cleanedVersion, MIN_OTA_FIRMWARE_VERSION)) {
        return {}
      }

      const buildContents = await storage
        .bucket(CHROMATECH_GCS_BUCKET_NAME)
        .file(file.name)
        .download()

      // Remove new lines and spaces
      const build = buildContents
        .toString()
        .replace(/[\r\n]+/gm, "")
        .trim()
      return { [version]: build }
    })
  )

  const filteredVersions = versions.filter((v) => v !== null)
  const firmwareVersionMap = Object.assign({}, ...filteredVersions)

  return firmwareVersionMap
}

export const getTimberLatestVersion = async () => {
  // Creates a client using Application Default Credentials
  const storage = new Storage()

  // Download the latest bundle name
  const timberLatestPath = "timber/latest"
  const latestContent = await storage
    .bucket(CHROMATECH_GCS_BUCKET_NAME)
    .file(timberLatestPath)
    .download()

  // Remove new lines and spaces
  const latestBundleId = latestContent
    .toString()
    .replace(/[\r\n]+/gm, "")
    .trim()

  // Download the latest version using bundle
  const manifestPath = `timber/builds/${latestBundleId}/manifest.json`
  const manifestContent = await storage
    .bucket(CHROMATECH_GCS_BUCKET_NAME)
    .file(manifestPath)
    .download()
  const manifest = JSON.parse(manifestContent.toString())

  // Return the latest version
  return manifest.version
}

export const getTimberFile = async (
  build: FirmwareBuild,
  path: string
): Promise<string> => {
  // Creates a client using Application Default Credentials
  const storage = new Storage()
  // Download the latest version using bundle
  const filePath = `timber/builds/${build}/${path}`
  const fileContent = await storage
    .bucket(CHROMATECH_GCS_BUCKET_NAME)
    .file(filePath)
    .download()

  return fileContent.toString()
}
