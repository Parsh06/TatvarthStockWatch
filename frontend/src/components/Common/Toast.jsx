import toast, { Toaster } from 'react-hot-toast'

export { toast }

export function TatvarthStockWatchToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: '#1E293B',
          color: '#F1F5F9',
          border: '1px solid #334155',
          borderRadius: '8px',
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#10B981', secondary: '#1E293B' } },
        error: { iconTheme: { primary: '#EF4444', secondary: '#1E293B' } },
      }}
    />
  )
}
