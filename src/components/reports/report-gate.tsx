import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Plug } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import type { ReportState } from "@/lib/google/types";

/**
 * Renders the right thing for a data source that is not connected or failed,
 * and otherwise hands the data to `children`.
 */
export function ReportGate<T>({
  state,
  clientId,
  isStaff,
  sourceName,
  explanation,
  children,
}: {
  state: ReportState<T>;
  clientId: string;
  isStaff: boolean;
  sourceName: string;
  /** One sentence on what this section will show once connected. */
  explanation: string;
  children: (data: T) => ReactNode;
}) {
  const connectHref = isStaff ? `/c/${clientId}/settings/integrations` : `/c/${clientId}/connect`;

  if (state.status === "not_connected") {
    return (
      <Card>
        <EmptyState
          icon={<Plug className="h-5 w-5" />}
          title={`${sourceName} is not connected yet`}
          action={
            <Link href={connectHref} className={buttonClass("primary")}>
              {isStaff ? `Connect ${sourceName}` : "Connect your Google account"}
            </Link>
          }
        >
          {explanation}{" "}
          {isStaff
            ? "Choose which Google account and property to use for this client."
            : "omniSEO can connect it for you, or you can connect your own Google account now."}
        </EmptyState>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title={`${sourceName} data could not be loaded`}
          action={
            isStaff || state.needsReconnect ? (
              <Link href={connectHref} className={buttonClass("secondary")}>
                {state.needsReconnect ? "Reconnect Google" : "Check the connection"}
              </Link>
            ) : undefined
          }
        >
          {state.message}
        </EmptyState>
      </Card>
    );
  }

  return <>{children(state.data)}</>;
}

/** "+12" style change in clicks or sessions for table cells. */
export function ChangeCell({
  current,
  previous,
  goodWhenUp = true,
}: {
  current: number;
  previous: number | null;
  goodWhenUp?: boolean;
}) {
  if (previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-subtle">0</span>;
  const good = diff > 0 === goodWhenUp;
  return (
    <span className={`tabular text-xs font-semibold ${good ? "text-up" : "text-down"}`}>
      {diff > 0 ? "+" : "-"}
      {Math.abs(diff).toLocaleString("en-GB", { maximumFractionDigits: 1 })}
    </span>
  );
}
