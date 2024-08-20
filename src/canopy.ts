export const formatCanopyMessage = (
  method: "get" | "set",
  key: string,
  data: object
) => {
  return {
    cmd: method,
    key: key,
    data: data,
    _rid: Math.round(Math.random() * 1000000000).toString(),
  }
}

export const parseCanopyRid = (message: any): string | null => {
  try {
    return message["_rid"]
  } catch (error) {
    return null
  }
}

export const parseCanopyMessage = (
  message: any
): { success: boolean; data: object; error?: string } => {
  try {
    return {
      success: message["result"],
      data: message["data"],
      error: message["error"],
    }
  } catch (error) {
    return {
      success: false,
      data: {},
      error: "Error parsing message",
    }
  }
}

export const isCanopyConfigMatch = (
  data: any,
  config: any,
  params: Record<string, string>
) => {
  // Set a wildcard value for config
  // This value should be "skipped" when validating config
  // ex: {ip: "*"} is used to skip IP checks
  const wildcard = "*"
  const paramSymbol = "$"

  // Find all params in config based on symbol and
  // replace them with the corresponding value.
  // Handle deep objects
  const replaceParams = (obj: any) => {
    for (const key in obj) {
      if (typeof obj[key] === "object") {
        replaceParams(obj[key])
      } else if (
        typeof obj[key] === "string" &&
        obj[key].startsWith(paramSymbol)
      ) {
        const param = obj[key].slice(1)
        if (params[param]) {
          obj[key] = params[param]
        }
      }
    }
  }
  replaceParams(config)

  // Deeply compare config to data, if the value is wildcard then skip
  const compare = (data: any, config: any) => {
    for (const key in config) {
      if (config[key] === wildcard) {
        continue
      }
      if (typeof config[key] === "object") {
        if (!compare(data[key], config[key])) {
          return false
        }
      } else if (data[key] !== config[key]) {
        return false
      }
    }
    return true
  }
  return compare(data, config)
}
