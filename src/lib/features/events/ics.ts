export interface IcsEventParams {
	id: string;
	title: string;
	description?: string;
	locationName?: string;
	locationAddress?: string;
	dateStart: string; // ISO string
	dateEnd?: string | null;
	url?: string;
}

function formatDateToIcs(dateStr: string): string {
	const d = new Date(dateStr);
	return d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

export function generateIcs(params: IcsEventParams): string {
	const dtStart = formatDateToIcs(params.dateStart);
	const dtEnd = params.dateEnd
		? formatDateToIcs(params.dateEnd)
		: formatDateToIcs(
				new Date(new Date(params.dateStart).getTime() + 4 * 3600 * 1000).toISOString()
			); // default 4h
	const now = formatDateToIcs(new Date().toISOString());

	const locationParts = [params.locationName, params.locationAddress].filter(Boolean);
	const location = locationParts.join(', ').replace(/,/g, '\\,');
	const summary = params.title.replace(/,/g, '\\,').replace(/;/g, '\\;');
	const description = (params.description || '').replace(/\n/g, '\\n').replace(/,/g, '\\,');

	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Einladung//Party App//DE',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${params.id}@einladung.app`,
		`DTSTAMP:${now}`,
		`DTSTART:${dtStart}`,
		`DTEND:${dtEnd}`,
		`SUMMARY:${summary}`,
		`DESCRIPTION:${description}`,
		location ? `LOCATION:${location}` : '',
		params.url ? `URL:${params.url}` : '',
		'BEGIN:VALARM',
		'TRIGGER:-P1D',
		'ACTION:DISPLAY',
		'DESCRIPTION:Erinnerung: Einladung morgen!',
		'END:VALARM',
		'BEGIN:VALARM',
		'TRIGGER:-PT2H',
		'ACTION:DISPLAY',
		'DESCRIPTION:Erinnerung: Event beginnt in 2 Stunden!',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	]
		.filter(Boolean)
		.join('\r\n');
}
