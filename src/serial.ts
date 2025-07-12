import { SerialPort, ReadlineParser } from "serialport"
import Timeout from "await-timeout"

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
      ['303a', '1001'], // ESP32-S3
      ['1a86', '7523'], // CH340
      ['303a', '814e'], // ESP32-C3
      ['303a', '814f'], // ESP32-C3
    ]

    return ports.filter(port => {
      const vid = port.vendorId
      const pid = port.productId
      if (!vid || !pid) return false

      return serialFilters.some(([v, p]) => v === vid && p === pid)
    })
  }

  static async waitForSingleDevice(): Promise<SerialDevice> {
    let ports = await SerialClient.getAvailablePorts()

    if (ports.length > 1) {
      throw new Error('Only one device supported at a time. Please disconnect extra devices.')
    }

    console.log('Waiting for device to be connected...')
    while (ports.length !== 1) {
      await Timeout.set(100)
      ports = await SerialClient.getAvailablePorts()
    }

    console.log('Device detected!')
    return ports[0]
  }

  async connect(device: SerialDevice): Promise<void> {
    this.port = new SerialPort({ 
      path: device.path, 
      baudRate: 115200 
    })
    this.parser = this.port.pipe(new ReadlineParser())
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

  async sendCommand(command: string, timeoutMs: number = 10000): Promise<string> {
    if (!this.port || !this.parser) {
      throw new Error('Serial port not connected')
    }

    const commandObj = JSON.parse(command)
    const rid = commandObj._rid

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.parser!.removeAllListeners('data')
        reject(new Error(`Command timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      this.parser!.on('data', (data: string) => {
        try {
          const response = JSON.parse(data.trim())
          if (response._rid === rid) {
            clearTimeout(timeout)
            this.parser!.removeAllListeners('data')
            resolve(data.trim())
          }
        } catch (error) {
          if (data.trim() !== '') {
            console.warn(`[unparseable response] ${data.trim()}`)
          }
        }
      })

      this.port!.write(command + '\n')
    })
  }

  async sendBinary(data: number[]): Promise<string> {
    if (!this.port || !this.parser) {
      throw new Error('Serial port not connected')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.parser!.removeAllListeners('data')
        reject(new Error('Binary command timeout'))
      }, 30000)

      this.parser!.on('data', (response: string) => {
        try {
          const responseObj = JSON.parse(response.trim())
          clearTimeout(timeout)
          this.parser!.removeAllListeners('data')
          resolve(response.trim())
        } catch (error) {
          if (response.trim() !== '') {
            console.warn(`[unparseable response] ${response.trim()}`)
          }
        }
      })

      const buffer = Buffer.from(data)
      this.port!.write(buffer)
    })
  }

  async waitForDisconnection(): Promise<void> {
    console.log('Waiting for device to be disconnected...')
    let ports = await SerialClient.getAvailablePorts()
    
    while (ports.length >= 1) {
      await Timeout.set(100)
      ports = await SerialClient.getAvailablePorts()
    }
    
    console.log('Device disconnected!')
  }
}