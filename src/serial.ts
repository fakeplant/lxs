import { SerialPort, ReadlineParser } from "serialport"
import Timeout from "await-timeout"
import chalk from "chalk"

export interface SerialDevice {
  path: string
  vendorId?: string
  productId?: string
}

export class SerialClient {
  private port?: SerialPort
  private parser?: ReadlineParser

  static async getAvailablePorts(): Promise<SerialDevice[]> {
    const ports = await SerialPort.list()
    const serialFilters = [
      ["303a", "1001"], // ESP32-S3
      ["1a86", "7523"], // CH340
      ["303a", "814e"], // ESP32-C3
      ["303a", "814f"], // ESP32-C3
    ]

    return ports.filter((port) => {
      const vid = port.vendorId
      const pid = port.productId
      if (!vid || !pid) return false

      return serialFilters.some(([v, p]) => v === vid && p === pid)
    })
  }

  static async waitForSingleDevice(): Promise<SerialDevice> {
    let ports = await SerialClient.getAvailablePorts()

    if (ports.length > 1) {
      throw new Error(
        "Only one device supported at a time. Please disconnect extra devices."
      )
    }

    console.log("Waiting for device to be connected...")
    while (ports.length !== 1) {
      await Timeout.set(100)
      ports = await SerialClient.getAvailablePorts()
    }

    console.log("Device detected!")
    return ports[0]
  }

  async connect(device: SerialDevice): Promise<void> {
    this.port = new SerialPort({
      path: device.path,
      baudRate: 115200,
    })
    this.parser = this.port.pipe(new ReadlineParser())

    // Wait 1 second after connecting for device to stabilize
    console.log(chalk.blue("Waiting for device to stabilize..."))
    await Timeout.set(5000)
  }

  async disconnect(): Promise<void> {
    if (this.port?.isOpen) {
      await new Promise<void>((resolve, reject) => {
        this.port!.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }

  async sendCommand(
    command: string,
    timeoutMs: number = 10000
  ): Promise<string> {
    if (!this.port || !this.parser) {
      throw new Error("Serial port not connected")
    }

    // Parse command to get the _rid for validation
    const commandObj = JSON.parse(command)
    const rid = commandObj._rid

    console.log(chalk.gray(`[SERIAL TX] ${command}`))

    return new Promise<string>((resolve, reject) => {
      let timeout: NodeJS.Timeout
      let resolved = false

      const dataHandler = (response: string) => {
        const trimmed = response.trim()
        if (!trimmed) return

        try {
          const responseObj = JSON.parse(trimmed)
          console.log(chalk.gray(`[SERIAL RX] ${trimmed}`))

          // Check if this is the response we're waiting for
          if (rid && responseObj._rid !== rid) {
            console.warn(
              chalk.yellow(
                `[SERIAL] Received response with mismatched _rid: expected ${rid}, got ${responseObj._rid}`
              )
            )
            return // Don't resolve, keep waiting for the right response
          }

          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            this.parser!.removeListener("data", dataHandler)
            resolve(trimmed)
          }
        } catch (error) {
          if (trimmed !== "") {
            console.warn(chalk.red(`[unparseable response] ${trimmed}`))
          }
        }
      }

      // Set up listener FIRST
      this.parser!.on("data", dataHandler)

      // Set timeout AFTER listener is attached (using the actual timeout parameter)
      timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.parser!.removeListener("data", dataHandler)
          reject(new Error(`Command timeout after ${timeoutMs}ms`))
        }
      }, timeoutMs)

      // NOW send the data - ensure we're sending with a newline
      this.port.write(command + "\n", (err) => {
        if (err) {
          resolved = true
          clearTimeout(timeout)
          this.parser!.removeListener("data", dataHandler)
          reject(err)
        }
      })
    })
  }

  async sendBinary(data: number[]): Promise<string> {
    if (!this.port || !this.parser) {
      throw new Error("Serial port not connected")
    }

    console.log(chalk.gray(`[SERIAL TX] Binary data (${data.length} bytes)`))

    return new Promise<string>((resolve, reject) => {
      let timeout: NodeJS.Timeout
      let resolved = false

      const dataHandler = (response: string) => {
        const trimmed = response.trim()
        if (!trimmed) return

        try {
          const responseObj = JSON.parse(trimmed)
          console.log(chalk.gray(`[SERIAL RX] ${trimmed}`))

          // For OTA responses, we don't check _rid since they don't include it
          // Just accept the first valid JSON response
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            this.parser!.removeListener("data", dataHandler)
            resolve(trimmed)
          }
        } catch (error) {
          if (trimmed !== "") {
            console.warn(chalk.red(`[unparseable response] ${trimmed}`))
          }
        }
      }

      // Set up listener FIRST
      this.parser!.on("data", dataHandler)

      // Set timeout AFTER listener is attached
      timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.parser!.removeListener("data", dataHandler)
          reject(new Error("Binary command timeout after 30s"))
        }
      }, 30000)

      // NOW send the data
      const buffer = Buffer.from(data)
      this.port.write(buffer, (err) => {
        if (err) {
          resolved = true
          clearTimeout(timeout)
          this.parser!.removeListener("data", dataHandler)
          reject(err)
        }
      })
    })
  }

  async waitForDisconnection(): Promise<void> {
    console.log("Waiting for device to be disconnected...")
    let ports = await SerialClient.getAvailablePorts()

    while (ports.length >= 1) {
      await Timeout.set(100)
      ports = await SerialClient.getAvailablePorts()
    }

    console.log("Device disconnected!")
  }
}
