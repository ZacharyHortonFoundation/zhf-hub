import { Award, Layers, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/client-ui";
import { BadgeMedal } from "@/components/volunteer/badge-medal";
import { deleteBadge, deleteProgram, deleteSkill, saveBadge, saveProgram, saveSkill } from "../actions";
import { PROGRAM_COLORS } from "@/lib/volunteers";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer setup" };

const COLORS = Object.keys(PROGRAM_COLORS);
const smallInput =
  "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

export default async function SetupPage() {
  await requireStaff();
  const [programs, skills, badges] = await Promise.all([
    db.program.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { opportunities: true } } } }),
    db.skill.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { volunteers: true, opportunities: true } } } }),
    db.badge.findMany({ orderBy: [{ kind: "asc" }, { hoursThreshold: "asc" }, { name: "asc" }], include: { _count: { select: { awards: true } } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Programs, skills & badges"
        description="The building blocks of volunteer management. Items in use can be renamed but not deleted."
        breadcrumbs={[{ label: "Volunteers", href: "/admin/volunteers" }, { label: "Setup" }]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Programs */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Layers className="size-4 text-brand-500" /> Programs</span>} description="Group opportunities (e.g. Indoor, Outdoor, Skills-based)." />
          <CardBody className="space-y-3">
            {programs.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-3">
                <form action={saveProgram} className="grid gap-2 sm:grid-cols-[1fr_110px]">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" defaultValue={p.name} className={smallInput} aria-label="Program name" />
                  <select name="color" defaultValue={p.color} className={smallInput} aria-label="Color">
                    {COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input name="description" defaultValue={p.description ?? ""} placeholder="Description" className={cn(smallInput, "sm:col-span-2")} aria-label="Description" />
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase", PROGRAM_COLORS[p.color] ?? PROGRAM_COLORS.blue)}>{p.name}</span>
                    <span className="text-xs text-slate-500">{p._count.opportunities} opportunities</span>
                    <span className="ml-auto" />
                    <SubmitButton size="xs" variant="secondary" pendingText="…">Save</SubmitButton>
                    <ConfirmSubmit size="xs" formAction={deleteProgram} confirmText="Delete?">Delete</ConfirmSubmit>
                  </div>
                </form>
              </div>
            ))}
            <form action={saveProgram} className="grid gap-2 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_110px_auto]">
              <input name="name" placeholder="New program name" className={smallInput} required />
              <select name="color" defaultValue="blue" className={smallInput}>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm" pendingText="…">Add</SubmitButton>
              <input name="description" placeholder="Description (optional)" className={cn(smallInput, "sm:col-span-3")} />
            </form>
          </CardBody>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Wrench className="size-4 text-brand-500" /> Skills</span>} description="Volunteers pick these as interests/experience; opportunities list the ones that help." />
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {skills.map((s) => (
                <li key={s.id} className="py-2">
                  <form action={saveSkill} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input name="name" defaultValue={s.name} className={cn(smallInput, "flex-1")} aria-label="Skill name" />
                    <span className="hidden w-28 shrink-0 text-right text-xs text-slate-500 sm:block">
                      {s._count.volunteers} vol · {s._count.opportunities} opp
                    </span>
                    <SubmitButton size="xs" variant="secondary" pendingText="…">Save</SubmitButton>
                    <ConfirmSubmit size="xs" formAction={deleteSkill} confirmText="Delete?">Delete</ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
            <form action={saveSkill} className="mt-3 flex gap-2">
              <input name="name" placeholder="New skill" className={cn(smallInput, "flex-1")} required />
              <SubmitButton size="sm" pendingText="…">Add skill</SubmitButton>
            </form>
          </CardBody>
        </Card>

        {/* Badges */}
        <Card className="xl:col-span-2">
          <CardHeader
            title={<span className="flex items-center gap-2"><Award className="size-4 text-brand-500" /> Badges</span>}
            description="Hours badges are awarded automatically when approved hours reach the threshold. Recognition badges are awarded by staff from a volunteer's profile."
          />
          <CardBody className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {badges.map((b) => (
                <form key={b.id} action={saveBadge} className="flex gap-3 rounded-xl border border-slate-200 p-3">
                  <input type="hidden" name="id" value={b.id} />
                  <BadgeMedal name={b.name} tier={b.tier} kind={b.kind} size="sm" />
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <input name="name" defaultValue={b.name} className={cn(smallInput, "sm:col-span-2")} aria-label="Badge name" />
                    <select name="tier" defaultValue={b.tier} className={smallInput} aria-label="Tier">
                      <option value="BRONZE">Bronze</option>
                      <option value="SILVER">Silver</option>
                      <option value="GOLD">Gold</option>
                    </select>
                    <select name="kind" defaultValue={b.kind} className={smallInput} aria-label="Type">
                      <option value="HOURS">Hours milestone</option>
                      <option value="RECOGNITION">Recognition</option>
                    </select>
                    <input name="hoursThreshold" type="number" step="0.5" min="0" defaultValue={b.hoursThreshold ?? ""} placeholder="Hours (milestones only)" className={smallInput} aria-label="Hours threshold" />
                    <input name="description" defaultValue={b.description ?? ""} placeholder="Description" className={smallInput} aria-label="Description" />
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Badge tone="gray">{b._count.awards} awarded</Badge>
                      <span className="ml-auto" />
                      <SubmitButton size="xs" variant="secondary" pendingText="…">Save</SubmitButton>
                      <ConfirmSubmit size="xs" formAction={deleteBadge} confirmText="Delete?">Delete</ConfirmSubmit>
                    </div>
                  </div>
                </form>
              ))}
            </div>
            <form action={saveBadge} className="grid gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-6 sm:items-end">
              <Field label="New badge" className="sm:col-span-2">
                <Input name="name" placeholder="e.g. Silver – 75 Hours" required />
              </Field>
              <Field label="Tier">
                <Select name="tier" defaultValue="BRONZE">
                  <option value="BRONZE">Bronze</option>
                  <option value="SILVER">Silver</option>
                  <option value="GOLD">Gold</option>
                </Select>
              </Field>
              <Field label="Type">
                <Select name="kind" defaultValue="HOURS">
                  <option value="HOURS">Hours milestone</option>
                  <option value="RECOGNITION">Recognition</option>
                </Select>
              </Field>
              <Field label="Hours">
                <Input name="hoursThreshold" type="number" step="0.5" min="0" />
              </Field>
              <SubmitButton pendingText="…">Add badge</SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
