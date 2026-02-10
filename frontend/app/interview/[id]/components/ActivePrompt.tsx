"use client";

import { Card } from "@/components/ui/Card";
import { InterviewPromptContent } from "./InterviewPromptContent";

interface ActivePromptProps {
  promptText: string;
  sectionName: string;
}

export function ActivePrompt({ promptText, sectionName }: ActivePromptProps) {
  return (
    <Card className="border-2 border-primary/30 bg-surface2/50 shadow-card">
      <div className="p-6">
        <InterviewPromptContent promptText={promptText} sectionName={sectionName} />
      </div>
    </Card>
  );
}
