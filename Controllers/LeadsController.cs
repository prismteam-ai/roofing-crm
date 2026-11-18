using Microsoft.AspNetCore.Mvc;
using RoofingCrm.Models.Requests;
using RoofingCrm.Services;

namespace RoofingCrm.Controllers;

[ApiController]
[Route("api/leads")]
public sealed class LeadsController : ControllerBase
{
    private readonly ILeadService _leadService;

    public LeadsController(ILeadService leadService)
    {
        _leadService = leadService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var leads = await _leadService.GetAllAsync(cancellationToken);
        return Ok(leads);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var lead = await _leadService.GetByIdAsync(id, cancellationToken);
        return lead is null ? NotFound() : Ok(lead);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCrmLeadRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PropertyId))
        {
            return BadRequest(new { error = "PropertyId is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Address))
        {
            return BadRequest(new { error = "Address is required." });
        }

        try
        {
            var lead = await _leadService.CreateAsync(request, cancellationToken);
            return CreatedAtAction(nameof(GetById), new { id = lead.Id }, lead);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCrmLeadRequest request, CancellationToken cancellationToken)
    {
        var lead = await _leadService.UpdateAsync(id, request, cancellationToken);
        return lead is null ? NotFound() : Ok(lead);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var deleted = await _leadService.DeleteAsync(id, cancellationToken);
        return deleted ? NoContent() : NotFound();
    }
}