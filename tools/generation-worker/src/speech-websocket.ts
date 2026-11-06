// Scoped esbuild injection for the browser Speech SDK. Does not patch globals.
// Workers opens outbound WebSockets with fetch/Upgrade, rather than new WebSocket.
interface NativeSocket extends EventTarget {
  accept(): void; send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void; binaryType: string;
}
export class WebSocket extends EventTarget {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  readonly CONNECTING=0; readonly OPEN=1; readonly CLOSING=2; readonly CLOSED=3;
  readyState=0;
  binaryType="arraybuffer";
  onopen: ((event: Event) => void) | null=null;
  onclose: ((event: Event & { code?: number; reason?: string }) => void) | null=null;
  onerror: ((event: Event & { message?: string }) => void) | null=null;
  onmessage: ((event: MessageEvent) => void) | null=null;
  private socket?: NativeSocket;
  constructor(readonly url: string) {
    super();
    void this.connect().catch(() => {
      this.readyState=3;
      const error=Object.assign(new Event("error"),{message:"Speech WebSocket connection failed."});
      this.onerror?.(error); this.dispatchEvent(error);
      const closed=Object.assign(new Event("close"),{code:1011,reason:"Speech connection failed."});
      this.onclose?.(closed); this.dispatchEvent(closed);
    });
  }
  private async connect() {
    const target=new URL(this.url);
    if (target.protocol!=="wss:") throw new Error("Secure Speech WebSocket required.");
    target.protocol="https:";
    const response=await fetch(target,{headers:{Upgrade:"websocket"},redirect:"manual",signal:AbortSignal.timeout(80_000)});
    const socket=(response as Response & {webSocket?: NativeSocket}).webSocket;
    if(response.status!==101 || !socket) throw new Error("Speech WebSocket upgrade failed.");
    this.socket=socket; socket.binaryType=this.binaryType; socket.accept();
    if(this.readyState===3){socket.close(1000);return;}
    socket.addEventListener("message",event=>{
      const message=new MessageEvent("message",{data:(event as MessageEvent).data});
      this.onmessage?.(message);this.dispatchEvent(message);
    });
    socket.addEventListener("close",event=>{
      this.readyState=3;
      const original=event as Event & {code:number;reason:string};
      const closed=Object.assign(new Event("close"),{code:original.code,reason:original.reason});
      this.onclose?.(closed);this.dispatchEvent(closed);
    });
    socket.addEventListener("error",()=>{
      const error=Object.assign(new Event("error"),{message:"Speech WebSocket failed."});
      this.onerror?.(error);this.dispatchEvent(error);
    });
    this.readyState=1;
    const opened=new Event("open");this.onopen?.(opened);this.dispatchEvent(opened);
  }
  send(data:string|ArrayBuffer|ArrayBufferView){
    if(this.readyState!==1 || !this.socket) throw new Error("Speech WebSocket is not open.");
    this.socket.send(data);
  }
  close(code=1000,reason=""){this.readyState=3;this.socket?.close(code,reason);}
}
