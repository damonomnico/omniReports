import { Field, Input, Select } from "@/components/ui/form";
import { COMMON_TIMEZONES, COUNTRIES } from "@/lib/countries";

export function ClientFormFields({
  defaults,
}: {
  defaults?: {
    name: string;
    website: string;
    businessName: string | null;
    timezone: string;
    countryCode: string;
  };
}) {
  const timezones = defaults && !COMMON_TIMEZONES.includes(defaults.timezone)
    ? [defaults.timezone, ...COMMON_TIMEZONES]
    : COMMON_TIMEZONES;
  return (
    <>
      <Field label="Client name" htmlFor="name">
        <Input id="name" name="name" defaultValue={defaults?.name} required maxLength={120} />
      </Field>
      <Field
        label="Website"
        htmlFor="website"
        hint="The domain we look for in Google results, for example sealability.co.uk."
      >
        <Input
          id="website"
          name="website"
          defaultValue={defaults?.website}
          placeholder="example.co.uk"
          required
          inputMode="url"
        />
      </Field>
      <Field
        label="Business name on Google Maps"
        htmlFor="businessName"
        hint="Used to spot the client in the local pack. Leave blank to use the client name."
      >
        <Input
          id="businessName"
          name="businessName"
          defaultValue={defaults?.businessName ?? ""}
          maxLength={160}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" htmlFor="countryCode">
          <Select id="countryCode" name="countryCode" defaultValue={defaults?.countryCode ?? "GB"}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue={defaults?.timezone ?? "Europe/London"}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}
