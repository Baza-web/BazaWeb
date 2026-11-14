import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canViewAttendance, isCompanyWide } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";
import { ClockCountdown } from "@phosphor-icons/react/ssr";

function duration(inAt: Date, outAt: Date | null) {
  const end = outAt ?? new Date();
  const ms = end.getTime() - inAt.getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export default async function AttendancePage() {
  const session = await requireSessionOrRedirect();
  const canViewTeam = canViewAttendance(session.role);

  const [myLogs, teamLogs] = await Promise.all([
    db.attendanceLog.findMany({
      where: { staffId: session.staffId },
      orderBy: { clockInAt: "desc" },
      take: 20,
    }),
    canViewTeam
      ? db.attendanceLog.findMany({
          where: isCompanyWide(session.role) ? {} : { branchId: session.branchId ?? "__none__" },
          include: { staff: true, branch: true },
          orderBy: { clockInAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="page-title">Attendance</h1>

      {canViewTeam && (
        <div className="card overflow-x-auto">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <ClockCountdown size={18} className="text-brand-500" aria-hidden="true" />
            Team attendance
          </h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Branch</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {teamLogs.map((log) => (
                <tr key={log.id}>
                  <td className="font-medium">{log.staff.name}</td>
                  <td>{log.branch.name}</td>
                  <td>{formatDateTime(log.clockInAt)}</td>
                  <td>{log.clockOutAt ? formatDateTime(log.clockOutAt) : "—"}</td>
                  <td>
                    {!log.clockOutAt ? (
                      <span className="badge bg-green-100 text-green-700">On the clock</span>
                    ) : (
                      duration(log.clockInAt, log.clockOutAt)
                    )}
                  </td>
                </tr>
              ))}
              {teamLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-stone-400">
                    No attendance recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3">Your history</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Clock in</th>
              <th>Clock out</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {myLogs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.clockInAt)}</td>
                <td>{log.clockOutAt ? formatDateTime(log.clockOutAt) : "—"}</td>
                <td>
                  {!log.clockOutAt ? (
                    <span className="badge bg-green-100 text-green-700">On the clock</span>
                  ) : (
                    duration(log.clockInAt, log.clockOutAt)
                  )}
                </td>
              </tr>
            ))}
            {myLogs.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-stone-400">
                  No attendance recorded yet — use the Clock in button at the top of the page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
