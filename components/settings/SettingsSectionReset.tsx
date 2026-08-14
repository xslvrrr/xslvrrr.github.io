"use client"

import * as React from "react"
import { IconRotate } from "@tabler/icons-react"

import { Button } from "../ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog"

interface SettingsSectionResetProps {
    /** Section name shown in the confirmation, e.g. "General". */
    sectionLabel: string
    onReset: () => void
}

/**
 * Restores one settings section to its defaults. Confirmation is required because the
 * change is immediate and is persisted server-side like any other settings edit.
 */
export function SettingsSectionReset({ sectionLabel, onReset }: SettingsSectionResetProps) {
    const [confirmOpen, setConfirmOpen] = React.useState(false)

    return (
        <>
            <div className="mb-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                    <IconRotate size={16} /> Reset section
                </Button>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset {sectionLabel} settings?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Every setting in {sectionLabel} returns to its default. Other sections are left alone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onReset()
                                setConfirmOpen(false)
                            }}
                        >
                            Reset
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
