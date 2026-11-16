"use client";

import { Plus } from "lucide-react";
import { createClientAction } from "@/lib/actions/clients";
import { ActionForm } from "@/components/ui/action-form";
import { Dialog } from "@/components/ui/dialog";
import { ClientFormFields } from "./client-form-fields";

export function AddClientDialog() {
  return (
    <Dialog
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add client
        </>
      }
      title="Add a client"
      description="You can add keywords, connect Google and invite the client afterwards."
    >
      <ActionForm action={createClientAction} submitLabel="Add client" pendingLabel="Adding...">
        <ClientFormFields />
      </ActionForm>
    </Dialog>
  );
}
