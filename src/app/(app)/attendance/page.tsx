import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canViewAttendance, canEditAttendance, isCompanyWide } from "@/lib/rbac";
import { formatDateTime, distanceMeters, mapsLink } from "@/lib/utils";
import { ClockCountdown, MapPin } from "@/components/icons";
import { AttendanceRowActions } from "@/components/AttendanceRowActions";
import { PrintButton } from "@/components/PrintButton";
import { formatDate } from "@/lib/utils";

function duration(inAt: Date, outAt: Date | null) {
  const end = outAt ?? new Date();
  const ms = end.getTime() - inAt.getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function LocationCell({
  lat,
  lng,
  branch,
}: {
  lat: number | null;
  lng: number | null;
  branch: { latitude: number | null; longitude: number | null; geofenceRadiusM: number | null };
}) {
  if (lat == null || lng == null) {
    return <span className="text-stone-400">—</span>;
  }
  const hasGeofence = branch.latitude != null && branch.longitude != null && branch.geofenceRadiusM != null;
  const withinFence =
    hasGeofence &&
    distanceMeters(branch.latitude!, branch.longitude!, lat, lng) <= branch.geofenceRadiusM!;

  return (
    <a
      href={mapsLink(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
    >
      <MapPin size={14} aria-hidden="true" />
      Map
      {hasGeofence && (
        <span className={`badge ${withinFence ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {withinFence ? "In range" : "Out of range"}
        </span>
      )}
    </a>
  );
}

export default async function AttendancePage() {
  const session = await requireSessionOrRedirect();
  const canViewTeam = canViewAttendance(session.roles);
  const canEdit = canEditAttendance(session.roles);

  const [myLogs, teamLogs] = await Promise.all([
    db.attendanceLog.findMany({
      where: { staffId: session.staffId },
      include: { branch: true },
      orderBy: { clockInAt: "desc" },
      take: 20,
    }),
    canViewTeam
      ? db.attendanceLog.findMany({
          where: isCompanyWide(session.roles) ? {} : { branchId: session.branchId ?? "__none__" },
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
        <div id="attendance-table" className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2 print:hidden">
              <ClockCountdown size={18} className="text-brand-500" aria-hidden="true" />
              Team attendance
            </h2>
            <PrintButton selector="#attendance-table" label="Print" />
          </div>
          <div className="print-report-header">
            <h2 className="font-display text-xl font-semibold">Team attendance</h2>
            <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {teamLogs.length} record(s)</p>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8 print:hidden">
                  <span className="sr-only">Include in print</span>
                </th>
                <th>Staff</th>
                <th>Branch</th>
                <th>Clock in</th>
                <th>In @</th>
                <th>Clock out</th>
                <th>Out @</th>
                <th>Duration</th>
                {canEdit && <th className="print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teamLogs.map((log) => (
                <tr key={log.id} data-print-row>
                  <td className="print:hidden">
                    <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${log.staff.name}'s record in print`} />
                  </td>
                  <td className="font-medium">{log.staff.name}</td>
                  <td>{log.branch.name}</td>
                  <td>{formatDateTime(log.clockInAt)}</td>
                  <td>
                    <LocationCell lat={log.clockInLat} lng={log.clockInLng} branch={log.branch} />
                  </td>
                  <td>{log.clockOutAt ? formatDateTime(log.clockOutAt) : "—"}</td>
                  <td>
                    <LocationCell lat={log.clockOutLat} lng={log.clockOutLng} branch={log.branch} />
                  </td>
                  <td>
                    {!log.clockOutAt ? (
                      <span className="badge bg-green-100 text-green-700">On the clock</span>
                    ) : (
                      duration(log.clockInAt, log.clockOutAt)
                    )}
                  </td>
                  {canEdit && (
                    <td className="print:hidden">
                      <AttendanceRowActions logId={log.id} clockInAt={log.clockInAt} clockOutAt={log.clockOutAt} />
                    </td>
                  )}
                </tr>
              ))}
              {teamLogs.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="py-6 text-center text-stone-400">
                    No attendance recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div id="my-attendance-table" className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title print:hidden">Your history</h2>
          <PrintButton selector="#my-attendance-table" label="Print" />
        </div>
        <div className="print-report-header">
          <h2 className="font-display text-xl font-semibold">Your attendance history</h2>
          <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {myLogs.length} record(s)</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Clock in</th>
              <th>In @</th>
              <th>Clock out</th>
              <th>Out @</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {myLogs.map((log) => (
              <tr key={log.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label="Include in print" />
                </td>
                <td>{formatDateTime(log.clockInAt)}</td>
                <td>
                  <LocationCell lat={log.clockInLat} lng={log.clockInLng} branch={log.branch} />
                </td>
                <td>{log.clockOutAt ? formatDateTime(log.clockOutAt) : "—"}</td>
                <td>
                  <LocationCell lat={log.clockOutLat} lng={log.clockOutLng} branch={log.branch} />
                </td>
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
                <td colSpan={6} className="py-6 text-center text-stone-400">
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
