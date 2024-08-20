export type ApiTimberLatestData = {
  version: string
}

export type FirmwareVersion = string

export type FirmwareBuild = string

export type FirmwareVersionRecord = Record<FirmwareVersion, FirmwareBuild>
