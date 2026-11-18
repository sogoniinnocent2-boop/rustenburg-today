import { TextTools } from "@/components/text-tools";

export default async function ToolsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-4xl">Document tools</h1>
      <p className="max-w-2xl text-sm">Word count, a text download, and a JSON array converted to CSV. These run in your browser. An AI model, PDF conversion, Word conversion and image conversion are not connected.</p>
      <TextTools />
    </div>
  );
}
