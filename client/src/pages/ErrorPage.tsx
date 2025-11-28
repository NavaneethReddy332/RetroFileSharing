import { useLocation } from "wouter";
import { RetroLayout } from "../components/RetroLayout";

export default function ErrorPage() {
  const [, setLocation] = useLocation();

  return (
    <RetroLayout>
      <center>
        <h1><span style={{ color: 'var(--text-primary)' }}>ERROR!</span></h1>
        <img src="https://win98icons.alexmeub.com/icons/png/msg_error-0.png" alt="Critical Error" width="64" />
        <br /><br />
        <h2 className="text-xl p-2 inline-block font-mono border-2" style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}>FATAL EXCEPTION</h2>
      </center>
      
      <br />
      
      <div className="border-2 p-4" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--panel)' }}>
        <p className="font-mono font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          A fatal exception 0E has occurred at 0028:C0034B23 in VXD VMM(01) + 000034B23. 
          The current application will be terminated.
        </p>
        
        <ul className="list-disc list-inside font-mono text-sm space-y-2">
           <li>* Press any key to terminate the current application.</li>
           <li>* Press CTRL+ALT+DEL again to restart your computer. You will lose any unsaved information in all applications.</li>
        </ul>
      </div>
      
      <br />
      
      <center>
        <button onClick={() => setLocation("/")} className="retro-button font-bold" style={{ color: 'var(--text-primary)' }}>
           &lt;&lt; RETURN TO SAFETY
        </button>
      </center>

      <br/>
      
      <div className="text-xs font-mono border-t pt-2" style={{ borderColor: 'var(--border-shadow)', color: 'var(--text-secondary)' }}>
        Debug Info: STACK_OVERFLOW / NULL_POINTER_EXCEPTION / FILE_CORRUPTED
      </div>
    </RetroLayout>
  );
}
