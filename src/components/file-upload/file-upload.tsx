import { useState } from "react";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  onFileSelect: (file: File | null) => void;
  accept?: string; // e.g. ".txt,.csv,.json"
  label?: string;
};

export function FileUpload({ onFileSelect, accept, label }: FileUploadProps) {
  const [fileName, setFileName] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      setFileName(file.name);
      onFileSelect(file);
    } else {
      setFileName("");
      onFileSelect(null);
    }
  };

  return (
    <div className="w-full">
      {label && <p className="mb-1 font-medium">{label}</p>}
      <label
        className={cn(
          "flex items-center justify-center w-full px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer",
          "hover:bg-muted transition-colors"
        )}
      >
        <input
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleChange}
        />
        <span className="text-sm text-muted-foreground">
          {fileName ? fileName : "Click to upload or drag a file here"}
        </span>
      </label>
    </div>
  );
}
