import WebSocket from "ws"

export default class WebSocketClient {
  private socket!: WebSocket
  private isConnected: boolean = false

  constructor(private url: string) {}

  async connect(timeout: number = 3000): Promise<void> {
    this.socket = new WebSocket(this.url)

    const connectionPromise = new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => {
        this.isConnected = true
        // console.log("WebSocket connection established")
        resolve()
      }

      this.socket.onerror = (error) => {
        // console.error("WebSocket connection error:", error)
        reject(error)
      }

      this.socket.onclose = () => {
        // console.log("WebSocket connection closed")
        this.isConnected = false
      }
    })

    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), timeout)
    )

    return Promise.race([connectionPromise, timeoutPromise])
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      this.socket.close()
    }
    this.isConnected = false
  }

  async sendCommand(command: string, skipResponse?: boolean): Promise<string> {
    if (!this.isConnected) {
      throw new Error("WebSocket is not connected.")
    }

    return new Promise<string>((resolve, reject) => {
      this.socket.onmessage = (event: any) => {
        resolve(event.data)
      }

      this.socket.onerror = (error) => {
        reject("Error sending command: " + error)
      }

      this.socket.send(command)

      if (skipResponse) {
        resolve("")
      }
    })
  }

  async executeSequentialCommands(commands: string[]): Promise<void> {
    for (const command of commands) {
      // console.log(`Sending command: ${command}`)
      const response = await this.sendCommand(command)
      // console.log(`Received response: ${response}`)

      // Handle side effect based on the response
      this.handleSideEffect(response)

      // Proceed to the next command after handling the side effect
    }
  }

  private handleSideEffect(response: string): void {
    // Implement your side effect logic here based on the response
    // console.log(`Handling side effect for response: ${response}`)
    // Example: Triggering a different command, logging, updating state, etc.
  }
}
