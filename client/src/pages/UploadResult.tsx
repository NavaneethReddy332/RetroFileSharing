import { useLocation, useRoute } from "wouter";
import { RetroLayout } from "../components/RetroLayout";
import { useTerminal } from "../context/TerminalContext";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Copy, CheckCircle } from "lucide-react";

export default function UploadResult() {
  const [, params] = useRoute("/result/:code");
  const code = params?.code || "000000";
  const [, setLocation] = useLocation();
  const { addLog } = useTerminal();
  const { toast } = useToast();
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
     addLog(`FILE_STORED_AT: /var/www/uploads/${code}`);
     addLog(`EXPIRY_SET: 24_HOURS`);
  }, [code, addLog]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      addLog(`CODE_COPIED: ${code}`);
      toast({
        title: "Copied!",
        description: "Share code copied to clipboard",
      });
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast({
        title: "Copy Failed",
        description: "Please copy the code manually",
        variant: "destructive",
      });
    }
  };

  const copyLink = async () => {
    const link = `${window.location.origin}/download/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      addLog(`LINK_COPIED`);
      toast({
        title: "Copied!",
        description: "Download link copied to clipboard",
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({
        title: "Copy Failed",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  return (
    <RetroLayout>
      <center>
        <h1><span style={{ color: 'hsl(var(--accent))' }}>SUCCESS!</span></h1>
        <br />
        <p>Your file has been uploaded to the World Wide Web.</p>
      </center>
      
      <br />
      
      <div className="border-2 p-4 text-center" style={{ borderColor: 'hsl(var(--accent))', backgroundColor: 'hsl(var(--panel))' }}>
        <p><b>YOUR SECRET CODE:</b></p>
        <div className="flex items-center justify-center gap-2 my-2">
          <h2 className="text-4xl font-mono tracking-widest border-2 p-2" style={{ backgroundColor: 'hsl(var(--terminal-bg))', borderColor: 'hsl(var(--accent))', color: 'hsl(var(--terminal-text))' }} data-testid="text-share-code">{code}</h2>
          <button 
            onClick={copyCode}
            className="retro-button flex items-center gap-1"
            aria-label="Copy share code to clipboard"
            data-testid="button-copy-code"
          >
            {codeCopied ? <CheckCircle size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {codeCopied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-sm">Give this code to your friend.</p>
      </div>
      
      <br />
      
      <div className="text-center">
        <p className="mb-2"><b>Direct Link:</b></p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <a href={`/download/${code}`} className="underline break-all" style={{ color: 'hsl(var(--accent))' }} data-testid="link-download">
            {typeof window !== 'undefined' ? `${window.location.origin}/download/${code}` : `/download/${code}`}
          </a>
          <button 
            onClick={copyLink}
            className="retro-button flex items-center gap-1 text-sm"
            aria-label="Copy download link to clipboard"
            data-testid="button-copy-link"
          >
            {linkCopied ? <CheckCircle size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {linkCopied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>
      
      <br /><br />
      
      <center>
        <button onClick={() => setLocation("/")} className="retro-button" data-testid="button-upload-another">
          Upload Another File
        </button>
      </center>
    </RetroLayout>
  );
}
