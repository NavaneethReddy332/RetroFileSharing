import { useLocation, useRoute } from "wouter";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useEffect } from "react";

export default function UploadResult() {
  const [, params] = useRoute("/result/:code");
  const code = params?.code || "000000";
  const [, setLocation] = useLocation();
  const { addLog } = useTerminal();

  useEffect(() => {
     addLog(`FILE_STORED_AT: /var/www/uploads/${code}`);
     addLog(`EXPIRY_SET: 24_HOURS`);
  }, [code]);

  return (
    <RetroLayout>
      <center>
        <h1><span style={{ color: 'var(--accent)' }}>SUCCESS!</span></h1>
        <br />
        <p>Your file has been uploaded to the World Wide Web.</p>
      </center>
      
      <br />
      
      <div className="border-2 p-4 text-center" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--panel)' }}>
        <p><b>YOUR SECRET CODE:</b></p>
        <h2 className="text-4xl font-mono tracking-widest border-2 inline-block p-2 my-2" style={{ backgroundColor: 'var(--terminal-bg)', borderColor: 'var(--accent)', color: 'var(--terminal-text)' }}>{code}</h2>
        <p className="text-sm">Give this code to your friend.</p>
      </div>
      
      <br />
      
      <p style={{ textAlign: "center" }}>
        <b>Direct Link:</b><br />
        <a href={`/download/${code}`} className="underline" style={{ color: 'var(--accent)' }} data-testid="link-download">
          {typeof window !== 'undefined' ? `${window.location.origin}/download/${code}` : `/download/${code}`}
        </a>
      </p>
      
      <br /><br />
      
      <center>
        <button onClick={() => setLocation("/")} className="retro-button">
          Upload Another File
        </button>
      </center>
    </RetroLayout>
  );
}
