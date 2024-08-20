import { Storage } from "@google-cloud/storage"
import fs from "fs"
import { getTimberLatestVersion, getTimberVersions } from "./utils"
import { ApiTimberLatestData } from "./types"
import { CHROMATECH_GCS_BUCKET_NAME } from "./const"

// FIRMWARE
// This script installs the latest firmware versions from GCS
// to the firmware directory. These are intended to be used for
// offline use in the desktop app.

// Creates a client using Application Default Credentials
const storage = new Storage()

// Bucket
const bucket = storage.bucket(CHROMATECH_GCS_BUCKET_NAME)
const bucketBuildsPath = "timber/builds"

// Local path to download files
const firmwarePath = "temp/firmware"

// Download files
export const downloadFirmware = async (version?: string) => {
  // Create local path
  await fs.mkdirSync(firmwarePath, { recursive: true })

  // Save latest version to json file
  const latestVersion = await getTimberLatestVersion()
  const latestJson: ApiTimberLatestData = { version: latestVersion } // hack use this type to avoid issues w/ API
  fs.writeFileSync(`${firmwarePath}/latest.json`, JSON.stringify(latestJson))
  console.info(`build:firmware — Latest saved to ${firmwarePath}/latest.json`)

  // Save versions to json file
  // Add version limit to attempt to reduce build size
  const versions = await getTimberVersions()
  fs.writeFileSync(`${firmwarePath}/versions.json`, JSON.stringify(versions))
  console.info(
    `build:firmware — Versions saved to ${firmwarePath}/versions.json`
  )

  // Download files
  const [files] = await bucket.getFiles({ prefix: bucketBuildsPath })
  await Promise.all(
    files.map(async (file: any) => {
      const fullFilePath = file.name.replace(`${bucketBuildsPath}/`, "")
      const pathParts = fullFilePath.split("/")
      const fileDirPath = pathParts.slice(0, pathParts.length - 1).join("/")

      // Name of build path to compare to version map
      const buildPath = pathParts[0]

      if (Object.values(versions).includes(buildPath)) {
        const localFileDirPath = `${firmwarePath}/builds/${fileDirPath}`

        // Filter version
        if (version && fileDirPath !== versions[version]) {
          return
        }

        await fs.mkdirSync(localFileDirPath, { recursive: true })
        const dest = `${firmwarePath}/builds/${fullFilePath}`
        if (!fs.existsSync(dest)) {
          await file.download({
            destination: dest,
          })
          console.info(`build:firmware — Downloaded ${fullFilePath}`)
        }
      }
    })
  )
}
