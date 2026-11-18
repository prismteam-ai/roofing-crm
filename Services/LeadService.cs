using System.Text.Json;
using RoofingCrm.Models;
using RoofingCrm.Models.Requests;

namespace RoofingCrm.Services;

public sealed class LeadService : ILeadService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly string _databasePath;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public LeadService(IHostEnvironment environment)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "data", "db.json");
    }

    public Task<IReadOnlyList<CrmLead>> GetAllAsync(CancellationToken cancellationToken = default) =>
        WithDatabaseAsync<IReadOnlyList<CrmLead>>(
            db => db.Leads.OrderByDescending(l => l.CreatedAt).ToList(),
            cancellationToken);

    public Task<CrmLead?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        WithDatabaseAsync(db => db.Leads.FirstOrDefault(l => l.Id == id), cancellationToken);

    public Task<CrmLead> CreateAsync(CreateCrmLeadRequest request, CancellationToken cancellationToken = default) =>
        WithDatabaseAsync(
            db =>
            {
                if (db.Leads.Any(l => l.PropertyId == request.PropertyId))
                {
                    throw new InvalidOperationException($"A CRM lead already exists for property '{request.PropertyId}'.");
                }

                var now = DateTimeOffset.UtcNow;
                var lead = new CrmLead
                {
                    Id = Guid.NewGuid(),
                    PropertyId = request.PropertyId,
                    Address = request.Address,
                    City = request.City,
                    Latitude = request.Latitude,
                    Longitude = request.Longitude,
                    RoofAgeYears = request.RoofAgeYears,
                    PermitOpen = request.PermitOpen,
                    PermitOpenYears = request.PermitOpenYears,
                    PermitStatus = request.PermitStatus,
                    ContractorName = request.ContractorName,
                    BbbRating = request.BbbRating,
                    LeadSignals = request.LeadSignals,
                    Status = CrmLeadStatus.New,
                    Notes = request.Notes,
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                db.Leads.Add(lead);
                return lead;
            },
            cancellationToken,
            save: true);

    public Task<CrmLead?> UpdateAsync(Guid id, UpdateCrmLeadRequest request, CancellationToken cancellationToken = default) =>
        WithDatabaseAsync(
            db =>
            {
                var lead = db.Leads.FirstOrDefault(l => l.Id == id);
                if (lead is null)
                {
                    return null;
                }

                if (request.Status.HasValue)
                {
                    lead.Status = request.Status.Value;
                }

                if (request.Notes is not null)
                {
                    lead.Notes = request.Notes;
                }

                lead.UpdatedAt = DateTimeOffset.UtcNow;
                return lead;
            },
            cancellationToken,
            save: true);

    public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default) =>
        WithDatabaseAsync(
            db =>
            {
                var lead = db.Leads.FirstOrDefault(l => l.Id == id);
                if (lead is null)
                {
                    return false;
                }

                db.Leads.Remove(lead);
                return true;
            },
            cancellationToken,
            save: true);

    private async Task<T> WithDatabaseAsync<T>(
        Func<CrmDatabase, T> action,
        CancellationToken cancellationToken,
        bool save = false)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var database = await ReadDatabaseAsync(cancellationToken);
            var result = action(database);
            if (save)
            {
                await WriteDatabaseAsync(database, cancellationToken);
            }

            return result;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<CrmDatabase> ReadDatabaseAsync(CancellationToken cancellationToken)
    {
        await EnsureDatabaseFileAsync(cancellationToken);

        await using var stream = File.Open(_databasePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var database = await JsonSerializer.DeserializeAsync<CrmDatabase>(stream, JsonOptions, cancellationToken);
        return database ?? new CrmDatabase();
    }

    private async Task WriteDatabaseAsync(CrmDatabase database, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_databasePath)!;
        Directory.CreateDirectory(directory);

        await using var stream = File.Open(_databasePath, FileMode.Create, FileAccess.Write, FileShare.None);
        await JsonSerializer.SerializeAsync(stream, database, JsonOptions, cancellationToken);
    }

    private async Task EnsureDatabaseFileAsync(CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_databasePath)!;
        Directory.CreateDirectory(directory);

        if (File.Exists(_databasePath))
        {
            return;
        }

        var empty = new CrmDatabase();
        await WriteDatabaseAsync(empty, cancellationToken);
    }
}