import { api } from "@/lib/api/http";
import { deleteDocument, getDocument } from "@/lib/api/special";

export const GET = api(getDocument);
export const DELETE = api(deleteDocument);
