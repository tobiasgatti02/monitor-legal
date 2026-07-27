import { api } from "@/lib/api/http";
import { createDocument, listDocuments } from "@/lib/api/special";

export const GET = api(listDocuments);
export const POST = api(createDocument);
