import { toast } from "react-toastify";

export function showSuccessToast(message: string) {
  toast.success(message, {
    position: "top-center",
    hideProgressBar: true,
    closeOnClick: false,
    draggable: false,
  });
}

export function showErrorToast(message: string) {
  toast.error(message, {
    position: "top-center",
    hideProgressBar: true,
    closeOnClick: false,
    draggable: false,
  });
}
