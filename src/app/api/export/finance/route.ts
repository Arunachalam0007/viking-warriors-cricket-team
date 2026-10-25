import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { todayIst } from "@/lib/dates";
import { parseFinanceFilter } from "@/lib/filters";
import { buildFinanceWorkbook } from "@/modules/export/excel";
import { getSetting } from "@/modules/settings/settings";

/** GET /api/export/finance?month=2026-10&playerId=…  (&scope=admin for the full admin workbook) */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filter = parseFinanceFilter(params);
  const wantsAdmin = params.get("scope") === "admin";
  const viewer = wantsAdmin ? await getViewer() : null;
  if (wantsAdmin && !viewer?.isAdmin) {
    return NextResponse.json({ error: "Admin login required" }, { status: 401 });
  }

  const showBalances = await getSetting("public_show_balances");
  const wb = await buildFinanceWorkbook(filter, { admin: wantsAdmin, showBalances });
  const buffer = await wb.xlsx.writeBuffer();
  const name = `viking-warriors-finance-${filter.month ?? todayIst()}${wantsAdmin ? "-admin" : ""}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
