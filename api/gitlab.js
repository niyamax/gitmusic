export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { username } = req.query;

    if (typeof username !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/.test(username)) {
        return res.status(400).json({ error: 'A valid GitLab username is required' });
    }

    try {
        const response = await fetch(`https://gitlab.com/users/${encodeURIComponent(username)}/calendar.json`, {
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: response.status === 404
                    ? `User "${username}" not found on GitLab`
                    : 'Failed to fetch GitLab data'
            });
        }

        const data = await response.json();

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch GitLab data' });
    }
}
