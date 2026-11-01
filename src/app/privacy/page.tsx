import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Notice - B-ETA",
  description: "How B-ETA collects, uses and keeps personal information.",
};

// Set these before publishing.
const CONTACT_EMAIL = "shoseitiso@gmail.com"; // replace with the address that will receive requests
const LAST_UPDATED = "1 November 2026";
const VERSION = "1.0 (draft pending legal review)";

const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "32px 20px 64px",
  lineHeight: 1.65,
  fontSize: 15,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};
const h2: React.CSSProperties = { fontSize: 19, marginTop: 32, marginBottom: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(128,128,128,.4)", fontSize: 13 };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid rgba(128,128,128,.2)", fontSize: 14, verticalAlign: "top" };

export default function PrivacyPage() {
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Privacy Notice</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        B-ETA bus tracking and booking, Botswana. Version {VERSION}. Last updated {LAST_UPDATED}.
      </p>

      <p>
        This notice explains what personal information B-ETA collects from passengers and
        from drivers, why it is collected, how long it is kept and what rights you have under
        the Botswana Data Protection Act, 2024. B-ETA shows where buses are and lets
        passengers request seats; bus operators run the buses.
      </p>

      <h2 style={h2}>1. Who is responsible</h2>
      <p>
        B-ETA provides the platform. For bookings and trips, B-ETA and the bus operator each
        handle your information for their own purposes, and B-ETA acts for the operator when it
        stores the operator&apos;s booking and driver records. To ask a question or use a right
        described below, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2 style={h2}>2. Information we collect and how long we keep it</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr><th style={th}>Information</th><th style={th}>Why</th><th style={th}>Kept for</th></tr>
          </thead>
          <tbody>
            <tr><td style={td}><b>Passengers:</b> name and phone number given when you request a seat</td><td style={td}>To confirm your seat and let you recover your booking</td><td style={td}>12 months after the trip</td></tr>
            <tr><td style={td}><b>Passengers:</b> anonymous device identifier and cancellation record</td><td style={td}>To keep your booking on your device and prevent misuse</td><td style={td}>90 days</td></tr>
            <tr><td style={td}><b>Passengers:</b> searches and failed booking look-ups</td><td style={td}>To protect the service from abuse and to fix faults</td><td style={td}>Searches 90 days; failed look-ups 24 hours</td></tr>
            <tr><td style={td}><b>Passengers:</b> complaints you send</td><td style={td}>To investigate and answer your complaint</td><td style={td}>24 months after the complaint is closed</td></tr>
            <tr><td style={td}><b>Drivers:</b> name, phone number and the bus assigned</td><td style={td}>To run the account and assign trips</td><td style={td}>While employed or engaged, plus 12 months</td></tr>
            <tr><td style={td}><b>Drivers:</b> bus location while on a trip</td><td style={td}>To show passengers where the bus is and estimate arrival; safety</td><td style={td}>12 months, then only summaries without positions</td></tr>
            <tr><td style={td}><b>Drivers:</b> consent record</td><td style={td}>To show that you agreed to tracking, or withdrew</td><td style={td}>As long as your account exists</td></tr>
            <tr><td style={td}>Backups of the above</td><td style={td}>To recover from errors</td><td style={td}>14 days</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        We do not use your information for advertising and we do not sell it. Passengers can
        look at buses without giving any personal information. Driver location is recorded
        only while a trip is in progress, and a driver may withdraw consent in the driver app at
        any time, which stops tracking.
      </p>

      <h2 style={h2}>3. Who can see it</h2>
      <p>
        Passengers see the position, speed and estimated arrival of buses, never the driver&apos;s
        name or phone. A bus operator sees the bookings, drivers and trips of its own business only.
        Authorised B-ETA staff can see records when needed to run the service, to answer a
        request from you or to fix a fault, and what they do is written to an audit log. We use
        service providers to host the system (database and web hosting) and to detect errors. We
        remove phone numbers and e-mail addresses from error reports before they leave our
        systems. We disclose information to the police or a court only when the law requires it.
      </p>

      <h2 style={h2}>4. Where it is stored and how it is protected</h2>
      <p>
        Information is stored with our hosting providers in data centres outside Botswana
        (currently in the European Union). Access is limited by role, connections are encrypted,
        backups are encrypted and unusual activity is monitored. If a breach puts your
        information at risk, we will notify the regulator and the people affected within the time the law requires.
      </p>

      <h2 style={h2}>5. Your rights</h2>
      <p>You may ask us to:</p>
      <ul>
        <li>show you the information we hold about you;</li>
        <li>correct information that is wrong;</li>
        <li>delete your information, except where the law or the safety and accounting records of the operator require us to keep it (trip records are then kept without your name);</li>
        <li>stop using your information or object to how it is used.</li>
      </ul>
      <p>
        <b>Drivers</b> can see their data, share a copy of it, request a correction and request deletion
        in the driver app under Profile, My Data, and can follow the answer there.{" "}
        <b>Passengers</b> can write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the booking reference
        and the phone number used. We will answer within 30 days. If you are not satisfied, you
        may complain to the Botswana data protection authority.
      </p>

      <h2 style={h2}>6. Children</h2>
      <p>
        B-ETA is not aimed at children. A parent or guardian may make a booking for a child and
        should give only their own contact details.
      </p>

      <h2 style={h2}>7. Changes</h2>
      <p>
        When this notice changes, the date and version above change. If a change affects how we
        use your information, we will tell drivers in the app before it takes effect.
      </p>
    </main>
  );
}