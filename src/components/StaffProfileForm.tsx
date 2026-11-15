"use client";

import { updateStaffProfile } from "@/app/(app)/staff/actions";

type StaffHr = {
  id: string;
  phone: string | null;
  nic: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfJoining: Date | null;
  employmentType: string | null;
};

function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function StaffProfileForm({ staff }: { staff: StaffHr }) {
  return (
    <form action={updateStaffProfile.bind(null, staff.id)} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Phone</label>
          <input className="input" name="phone" defaultValue={staff.phone ?? ""} />
        </div>
        <div>
          <label className="label">NIC / ID number</label>
          <input className="input" name="nic" defaultValue={staff.nic ?? ""} />
        </div>
        <div>
          <label className="label">Date of birth</label>
          <input className="input" type="date" name="dateOfBirth" defaultValue={toDateInput(staff.dateOfBirth)} />
        </div>
        <div>
          <label className="label">Date of joining</label>
          <input className="input" type="date" name="dateOfJoining" defaultValue={toDateInput(staff.dateOfJoining)} />
        </div>
        <div>
          <label className="label">Employment type</label>
          <select className="input" name="employmentType" defaultValue={staff.employmentType ?? ""}>
            <option value="">Not set</option>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Address</label>
        <input className="input" name="address" defaultValue={staff.address ?? ""} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Emergency contact name</label>
          <input className="input" name="emergencyContactName" defaultValue={staff.emergencyContactName ?? ""} />
        </div>
        <div>
          <label className="label">Emergency contact phone</label>
          <input className="input" name="emergencyContactPhone" defaultValue={staff.emergencyContactPhone ?? ""} />
        </div>
      </div>
      <button type="submit" className="btn-primary">
        Save HR details
      </button>
    </form>
  );
}
