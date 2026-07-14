"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addVat, removeVat } from "@/lib/vat";

const fc =
  "h-10 bg-neutral-800 border-neutral-700 text-neutral-100 text-sm placeholder:text-neutral-600";

interface VatAmountPairProps {
  exclLabel?: string;
  inclLabel?: string;
  exclValue: string;
  inclValue: string;
  onChange: (excl: string, incl: string) => void;
}

export function VatAmountPair({
  exclLabel = "Excl. VAT (€)",
  inclLabel = "Incl. VAT (€)",
  exclValue,
  inclValue,
  onChange,
}: VatAmountPairProps) {
  function onExclChange(raw: string) {
    if (raw === "") {
      onChange("", "");
      return;
    }
    const net = Number(raw);
    if (Number.isNaN(net)) return;
    onChange(raw, net === 0 ? "0" : String(addVat(net)));
  }

  function onInclChange(raw: string) {
    if (raw === "") {
      onChange("", "");
      return;
    }
    const gross = Number(raw);
    if (Number.isNaN(gross)) return;
    onChange(gross === 0 ? "0" : String(removeVat(gross)), raw);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label className="text-neutral-400 text-xs">{exclLabel}</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={exclValue}
          onChange={(e) => onExclChange(e.target.value)}
          className={`${fc} font-mono`}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-neutral-400 text-xs">{inclLabel}</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={inclValue}
          onChange={(e) => onInclChange(e.target.value)}
          className={`${fc} font-mono`}
        />
      </div>
    </div>
  );
}
