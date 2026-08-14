"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface TourSkipDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onConfirm: () => void
}

export function TourSkipDialog({ isOpen, onOpenChange, onConfirm }: TourSkipDialogProps): React.ReactElement {
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent className="z-[10031]" overlayClassName="z-[10030] bg-black/45">
        <AlertDialogHeader>
          <AlertDialogTitle>Skip the tour?</AlertDialogTitle>
          <AlertDialogDescription>
            You can start it again later from the tour controls provided by the dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep touring</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>Skip tour</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
