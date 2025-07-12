import { readFileSafe } from "./utils"
import JSON5 from "json5"
import readline from "readline"

export interface IPSelectionResult {
  mode: "all" | "single" | "custom"
  ips: string[]
}

export const promptIPSelection = async (ipsPath: string): Promise<IPSelectionResult> => {
  const ipsData = readFileSafe(ipsPath)
  if (!ipsData) {
    throw new Error("Could not read IPs file")
  }
  
  const allIps = JSON5.parse(ipsData) as string[]
  
  if (allIps.length === 0) {
    throw new Error("No IPs found in project")
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  console.log(`\nFound ${allIps.length} IPs in project:`)
  allIps.forEach((ip, index) => {
    console.log(`  ${index + 1}. ${ip}`)
  })

  console.log("\nSelect an option:")
  console.log("  a) Run on ALL IPs")
  console.log("  s) Select a SINGLE IP from list")
  console.log("  c) Enter CUSTOM IP")

  const choice = await new Promise<string>((resolve) => {
    rl.question("\nEnter choice (a/s/c): ", (answer) => {
      resolve(answer.toLowerCase().trim())
    })
  })

  let result: IPSelectionResult

  switch (choice) {
    case "a":
    case "all":
      result = { mode: "all", ips: allIps }
      break

    case "s":
    case "single":
      const selection = await new Promise<string>((resolve) => {
        rl.question(`\nSelect IP (1-${allIps.length}): `, (answer) => {
          resolve(answer.trim())
        })
      })
      
      const index = parseInt(selection) - 1
      if (index < 0 || index >= allIps.length) {
        rl.close()
        throw new Error("Invalid selection")
      }
      
      result = { mode: "single", ips: [allIps[index]] }
      break

    case "c":
    case "custom":
      const customIP = await new Promise<string>((resolve) => {
        rl.question("\nEnter custom IP: ", (answer) => {
          resolve(answer.trim())
        })
      })
      
      if (!customIP.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
        rl.close()
        throw new Error("Invalid IP address format")
      }
      
      result = { mode: "custom", ips: [customIP] }
      break

    default:
      rl.close()
      throw new Error("Invalid choice")
  }

  rl.close()
  return result
}

export const confirmAction = async (message: string): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      resolve(answer.toLowerCase().trim())
    })
  })

  rl.close()
  return answer === "y" || answer === "yes"
}